package krd.pass.auth.demo.network

import krd.pass.auth.KrdpassTokenResult

import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
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
 * Talks to your application's backend (the BFF), which holds the client secret
 * and runs PAR, token exchange, refresh, and revocation against KRDPASS.
 */
class AuthBackendService(
    private val backendUrl: String,
    private val httpClient: OkHttpClient = OkHttpClient()
) {
    private companion object {
        /** OAuth's own fallback when a token response omits expires_in. */
        const val DEFAULT_EXPIRES_IN_SECONDS = 3600
    }

    private val jsonMediaType = "application/json".toMediaType()

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

        // Fail here, not three lines later inside authenticate(""): a PAR response without a
        // requestUri is a broken backend, and an empty string only moves the error somewhere
        // that no longer names the cause.
        val requestUri = json.optString("requestUri")
        if (requestUri.isBlank()) {
            throw IOException("The backend's PAR response contained no requestUri.")
        }

        return ParResponse(
            requestUri = requestUri,
            expiresIn = if (json.has("expiresIn")) json.optInt("expiresIn") else null,
            state = json.optString("state").takeIf { json.has("state") }
        )
    }

    suspend fun exchangeToken(
        code: String,
        state: String,
        codeVerifier: String
    ): KrdpassTokenResult {
        val requestBody = JSONObject().apply {
            put("code", code)
            put("state", state)
            put("codeVerifier", codeVerifier)
        }

        val request = Request.Builder()
            .url("$backendUrl/oauth/token")
            .post(requestBody.toString().toRequestBody(jsonMediaType))
            .build()

        val responseBody = makeRequest(request)
        val json = JSONObject(responseBody)

        return parseTokens(json)
    }

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

        return parseTokens(json)
    }

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
     * Parse a token response from the BFF. camelCase only: that is the
     * reference server's contract, and also accepting snake_case would only
     * hide the day the two stop agreeing.
     */
    private fun parseTokens(json: JSONObject): KrdpassTokenResult = KrdpassTokenResult(
        accessToken = json.optString("accessToken"),
        idToken = json.optString("idToken").takeIf { it.isNotBlank() },
        tokenType = json.optString("tokenType", "Bearer"),
        expiresIn = json.optInt("expiresIn", DEFAULT_EXPIRES_IN_SECONDS),
        refreshToken = json.optString("refreshToken").takeIf { it.isNotBlank() },
        scope = json.optString("scope").takeIf { json.has("scope") },
        // receivedAt defaults to now. Leave it: it is a stamp from THIS device's clock, and
        // isExpired() compares receivedAt + expiresIn against this device's clock too. A
        // backend-supplied value would mix two clocks.
    )

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
                    val body = response.body.string()
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
