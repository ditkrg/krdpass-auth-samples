package krd.pass.auth.demo.network

import krd.pass.auth.KrdpassTokenResult

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Result of a Pushed Authorization Request (PAR).
 * The [requestUri] is then used to launch the KRDPASS authentication flow.
 */
data class ParResponse(
    val requestUri: String,
    val expiresIn: Int?,
    val state: String?
)



/**
 * AuthBackendService: Handles communication with your application's backend.
 * 
 * In a production environment, your app should NOT talk directly to the KRDPASS
 * Identity Provider for sensitive operations like token exchange. Instead, 
 * these should go through your backend to keep client secrets secure.
 */
class AuthBackendService(
    private val backendUrl: String,
    private val httpClient: OkHttpClient = OkHttpClient()
) {
    private val jsonMediaType = "application/json".toMediaType()

    /**
     * Step 1: Request a secure Request URI from your backend.
     * Your backend should interact with the KRDPASS PAR endpoint.
     */
    suspend fun getRequestUri(
        codeChallenge: String,
        state: String? = null,
        nonce: String? = null,
        environment: String,
        redirectUri: String,
        scope: String? = null
    ): ParResponse {
        val requestBody = JSONObject().apply {
            put("codeChallenge", codeChallenge)
            put("codeChallengeMethod", "S256")
            put("environment", environment)
            put("redirectUri", redirectUri)
            state?.let { put("state", it) }
            nonce?.let { put("nonce", it) }
            scope?.let { put("scope", it) }
        }

        val request = Request.Builder()
            .url("$backendUrl/oauth/par")
            .post(requestBody.toString().toRequestBody(jsonMediaType))
            .build()

        val responseBody = makeRequest(request)
        val json = JSONObject(responseBody)
        
        return ParResponse(
            requestUri = json.optString("requestUri", json.optString("request_uri")),
            expiresIn = if (json.has("expiresIn")) json.optInt("expiresIn") else if (json.has("expires_in")) json.optInt("expires_in") else null,
            state = json.optString("state").takeIf { json.has("state") }
        )
    }

    /**
     * Step 2: Exchange the authorization code for tokens via your backend.
     * This ensures your client secret stays safe on the server.
     */
    suspend fun exchangeToken(
        code: String,
        state: String,
        codeVerifier: String,
        environment: String,
        redirectUri: String
    ): KrdpassTokenResult {
        val requestBody = JSONObject().apply {
            put("code", code)
            put("state", state)
            put("codeVerifier", codeVerifier)
            put("environment", environment)
            put("redirectUri", redirectUri)
        }

        val request = Request.Builder()
            .url("$backendUrl/oauth/token")
            .post(requestBody.toString().toRequestBody(jsonMediaType))
            .build()

        val responseBody = makeRequest(request)
        val json = JSONObject(responseBody)

        return KrdpassTokenResult.fromMap(mapOf(
            "accessToken" to json.optString("accessToken", json.optString("access_token")),
            "tokenType" to json.optString("tokenType", json.optString("token_type", "Bearer")),
            "expiresIn" to (if (json.has("expiresIn")) json.optInt("expiresIn") else if (json.has("expires_in")) json.optInt("expires_in") else null),
            "refreshToken" to json.optString("refreshToken", json.optString("refresh_token")).takeIf { it.isNotBlank() },
            "idToken" to json.optString("idToken", json.optString("id_token")).takeIf { it.isNotBlank() },
            "scope" to json.optString("scope").takeIf { json.has("scope") }
        ))
    }

    /**
     * Step 3: Refresh tokens via your backend.
     * Proxies POST /oauth/token/refresh to avoid exposing client secret on the client.
     *
     * @param refreshToken The refresh token obtained from a previous exchange.
     * @param environment The environment (e.g., "development", "production").
     * @param scope Optional list of scopes to request (space-delimited).
     * @return TokenResponse containing new access/refresh tokens.
     */
    suspend fun refreshToken(
        refreshToken: String,
        environment: String,
        scope: String? = null
    ): KrdpassTokenResult {
        val requestBody = JSONObject().apply {
            put("refreshToken", refreshToken)
            put("environment", environment)
            scope?.let { put("scope", it) }
        }

        val request = Request.Builder()
            .url("$backendUrl/oauth/token/refresh")
            .post(requestBody.toString().toRequestBody(jsonMediaType))
            .build()

        val responseBody = makeRequest(request)
        val json = JSONObject(responseBody)

        return KrdpassTokenResult.fromMap(mapOf(
            "accessToken" to json.optString("accessToken", json.optString("access_token")),
            "tokenType" to json.optString("tokenType", json.optString("token_type", "Bearer")),
            "expiresIn" to (if (json.has("expiresIn")) json.optInt("expiresIn") else if (json.has("expires_in")) json.optInt("expires_in") else null),
            "refreshToken" to json.optString("refreshToken", json.optString("refresh_token")).takeIf { it.isNotBlank() },
            "idToken" to json.optString("idToken", json.optString("id_token")).takeIf { it.isNotBlank() },
            "scope" to json.optString("scope").takeIf { json.has("scope") }
        ))
    }

    /**
     * Step 4: Revoke token via your backend.
     * Proxies POST /oauth/token/revoke to invalidate the token.
     *
     * @param token The token to revoke (access or refresh).
     * @param environment The environment (e.g., "development", "production").
     * @param tokenTypeHint Optional hint about the token type ("access_token" or "refresh_token").
     */
    suspend fun revokeToken(
        token: String,
        environment: String,
        tokenTypeHint: String? = null
    ) {
        val requestBody = JSONObject().apply {
            put("token", token)
            put("environment", environment)
            tokenTypeHint?.let { put("tokenTypeHint", it) }
        }

        val request = Request.Builder()
            .url("$backendUrl/oauth/token/revoke")
            .post(requestBody.toString().toRequestBody(jsonMediaType))
            .build()

        makeRequest(request)
    }

    /**
     * Helper to perform asynchronous network requests using OkHttp and Coroutines.
     */
    private suspend fun makeRequest(request: Request): String = suspendCancellableCoroutine { continuation ->
        val call = httpClient.newCall(request)
        
        continuation.invokeOnCancellation {
            call.cancel()
        }

        call.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                continuation.resumeWithException(IOException("Can't reach the backend. Check your connection and that the server is running.", e))
            }

            override fun onResponse(call: Call, response: Response) {
                response.use {
                    val body = response.body?.string() ?: ""
                    if (!response.isSuccessful) {
                        continuation.resumeWithException(IOException(describeError(response.code, response.message, body)))
                        return
                    }
                    continuation.resume(body)
                }
            }
        })
    }

    private fun describeError(code: Int, httpMessage: String, body: String): String {
        val fromBody = runCatching {
            val json = JSONObject(body)
            val desc = json.optString("error_description").takeIf { it.isNotBlank() }
            val err = json.optString("error").takeIf { it.isNotBlank() }
            desc ?: err
        }.getOrNull()
        if (fromBody != null) return "$fromBody (HTTP $code)"

        val friendly = when (code) {
            in 500..599 -> "The backend is unavailable right now. Make sure the backend server is running and reachable."
            401, 403 -> "The backend rejected this request (not authorized)."
            404 -> "Backend endpoint not found. Check the backend URL."
            else -> httpMessage.takeIf { it.isNotBlank() } ?: "Request failed"
        }
        return "$friendly (HTTP $code)"
    }
}
