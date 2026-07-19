package krd.pass.auth.demo.ui

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import androidx.compose.ui.res.painterResource
import krd.pass.auth.demo.R
import krd.pass.auth.demo.ui.theme.KrdpassSuccess
import krd.pass.auth.KrdpassAuth
import krd.pass.auth.KrdpassTokenResult
import krd.pass.auth.KrdpassUserInfo

/**
 * The main UI entry point for the demo app.
 * Separating the UI from the Activity makes the code cleaner and more testable.
 */
@Composable
fun MainScreen(
    onSignIn: (withCitizen: Boolean, withOffline: Boolean, useServer: Boolean) -> Unit,
    onFetchUserInfo: (accessToken: String) -> Unit,
    onLogout: () -> Unit,
    loading: Boolean = false,
    tokens: KrdpassTokenResult? = null,
    userInfo: KrdpassUserInfo? = null,
    error: String? = null,
    onClearError: () -> Unit,
    onVerifyToken: () -> Unit,
    onRefreshToken: () -> Unit,
    onRevokeToken: () -> Unit,
    actionMessage: String? = null
) {
    var citizenScope by remember { mutableStateOf(true) }
    var offlineScope by remember { mutableStateOf(true) }
    var useServerMode by remember { mutableStateOf(true) }

    // NOTE: decodeTokenUnverified is unverified: for display only, never for trust decisions.
    // It throws on a non-JWT (access tokens are often opaque), so decode defensively.
    fun claimsOf(token: String?): Map<String, Any?> =
        token?.let { runCatching { KrdpassAuth.decodeTokenUnverified(it) }.getOrNull() } ?: emptyMap()
    val idClaims = claimsOf(tokens?.idToken)
    val accessClaims = claimsOf(tokens?.accessToken)
    val activeClaims = userInfo?.raw ?: idClaims

    Box(modifier = Modifier.fillMaxSize()) {
        if (tokens == null) {
            LandingScreen(
                loading = loading,
                error = error,
                citizenScope = citizenScope,
                offlineScope = offlineScope,
                useServerMode = useServerMode,
                onCitizenScopeChange = { citizenScope = it },
                onOfflineScopeChange = { offlineScope = it },
                onServerModeChange = { useServerMode = it },
                onSignInClick = { onSignIn(citizenScope, offlineScope, useServerMode) },
                onClearError = onClearError
            )
        } else {
            LoggedInDashboard(
                claims = activeClaims,
                idClaims = idClaims,
                accessClaims = accessClaims,
                userInfo = userInfo,
                isLoadingUserInfo = loading,
                onFetchUserInfo = { onFetchUserInfo(tokens.accessToken) },
                onLogout = onLogout,
                onVerifyToken = onVerifyToken,
                onRefreshToken = onRefreshToken,
                onRevokeToken = onRevokeToken,
                actionMessage = actionMessage
            )
        }
    }
}

@Composable
private fun LandingScreen(
    loading: Boolean,
    error: String?,
    citizenScope: Boolean,
    offlineScope: Boolean,
    useServerMode: Boolean,
    onCitizenScopeChange: (Boolean) -> Unit,
    onOfflineScopeChange: (Boolean) -> Unit,
    onServerModeChange: (Boolean) -> Unit,
    onSignInClick: () -> Unit,
    onClearError: () -> Unit
) {
    val scrollState = rememberScrollState()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .statusBarsPadding()
            .navigationBarsPadding()
            .padding(horizontal = 24.dp)
            .verticalScroll(scrollState),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Logo Section
        Box(
            modifier = Modifier
                .size(72.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Default.Lock, contentDescription = null, tint = Color.White, modifier = Modifier.size(36.dp))
        }

        Spacer(Modifier.height(16.dp))

        Text(
            text = "KRDPASS",
            style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Black),
            color = MaterialTheme.colorScheme.onSurface
        )

        Text(
            text = "Digital Identity Demo",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f)
        )

        Spacer(Modifier.height(32.dp))

        // Error Handling
        if (error != null) {
            val errorScrollState = rememberScrollState()
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                shape = RoundedCornerShape(20.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.Top
                ) {
                    // Icon chip: soft error tint so it reads as an accent, not an alarm.
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .background(
                                MaterialTheme.colorScheme.error.copy(alpha = 0.12f),
                                RoundedCornerShape(10.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.Warning,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Sign-in failed",
                            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                        Spacer(Modifier.height(2.dp))
                        Box(
                            modifier = Modifier
                                .heightIn(max = 140.dp)
                                .verticalScroll(errorScrollState)
                        ) {
                            Text(
                                error,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.8f)
                            )
                        }
                    }
                    Spacer(Modifier.width(8.dp))
                    IconButton(onClick = onClearError, modifier = Modifier.size(28.dp)) {
                        Icon(
                            Icons.Default.Close,
                            contentDescription = "Dismiss",
                            tint = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f),
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }

        // Configuration Section
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            shape = RoundedCornerShape(24.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth(),
            elevation = CardDefaults.cardElevation(defaultElevation = 0.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // Citizen Data Toggle
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Citizen Data", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        Text("Include citizen_identity scope", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    }
                    Switch(
                        checked = citizenScope,
                        onCheckedChange = onCitizenScopeChange,
                        modifier = Modifier.scale(0.8f)
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))

                // Offline Access Toggle (Refresh Token)
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Offline Access", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        Text("Include offline_access scope (Refresh Token)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f))
                    }
                    Switch(
                        checked = offlineScope,
                        onCheckedChange = onOfflineScopeChange,
                        modifier = Modifier.scale(0.8f)
                    )
                }
                
                HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f))

                // Auth Mode Toggle
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text("Auth Mode", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
                        Text(if (useServerMode) "Backend-mediated (Secure)" else "Direct (Client-only)", 
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Switch(
                        checked = useServerMode,
                        onCheckedChange = onServerModeChange,
                        modifier = Modifier.scale(0.8f)
                    )
                }
            }
        }

        Spacer(Modifier.height(24.dp))

        // Action Button
        Button(
            onClick = onSignInClick,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(16.dp),
            enabled = !loading
        ) {
            if (loading) {
                CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    painter = painterResource(id = R.drawable.krdpass),
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = Color.White
                )
                Spacer(Modifier.width(12.dp))
                Text(
                    "Sign in with KRDPASS",
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontWeight = FontWeight.Medium,
                        fontSize = 16.sp,
                        letterSpacing = 0.32.sp
                    )
                )
            }
        }
    }
}

@Composable
private fun LoggedInDashboard(
    claims: Map<String, Any?>,
    idClaims: Map<String, Any?>,
    accessClaims: Map<String, Any?>,
    userInfo: KrdpassUserInfo?,
    isLoadingUserInfo: Boolean,
    onFetchUserInfo: () -> Unit,
    onLogout: () -> Unit,
    onVerifyToken: () -> Unit,
    onRefreshToken: () -> Unit,
    onRevokeToken: () -> Unit,
    actionMessage: String? = null
) {
    // Identity resolution
    val fullName = userInfo?.citizenFullName ?: run {
        val parts = listOfNotNull(
            claims["citizen_first"] as? String,
            claims["citizen_second"] as? String,
            claims["citizen_third"] as? String,
            claims["citizen_surname"] as? String
        ).filter { it.isNotBlank() }
        if (parts.isNotEmpty()) parts.joinToString(" ") else claims["upn"] as? String ?: "Citizen User"
    }
    
    val email = userInfo?.email ?: claims["email"] as? String ?: claims["upn"] as? String ?: "No email"
    val birthdate = userInfo?.birthdate ?: claims["birthdate"] as? String
    val sex = userInfo?.sexAtBirth ?: claims["sex_at_birth"] as? String
    val profilePicUrl = userInfo?.picture ?: claims["citizen_profile_picture"] as? String ?: idClaims["citizen_profile_picture"] as? String
    
    val scrollState = rememberScrollState()

    Column(modifier = Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        // App Bar
        Row(modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp, start = 24.dp, end = 24.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    "Welcome,",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium),
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
                Text(
                    userInfo?.citizenFirst ?: idClaims["citizen_first"] as? String ?: "Citizen",
                    style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Black),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            IconButton(
                onClick = onLogout, 
                modifier = Modifier
                    .size(40.dp)
                    .background(MaterialTheme.colorScheme.error.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
            ) {
                Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Logout", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(20.dp))
            }
        }

        Column(modifier = Modifier.weight(1f).verticalScroll(scrollState).padding(horizontal = 24.dp)) {
            // Identity Card
            Card(
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                shape = RoundedCornerShape(24.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(0.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.Top) {
                        ProfileImage(profilePicUrl)
                        Spacer(Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                fullName, 
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 18.sp
                                ), 
                                color = MaterialTheme.colorScheme.onSurface,
                                maxLines = 2, 
                                overflow = TextOverflow.Ellipsis
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                email, 
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp), 
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f), 
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                    
                    Spacer(Modifier.height(20.dp))

                    // Verification Badge
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(KrdpassSuccess.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                            .border(1.dp, KrdpassSuccess.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = KrdpassSuccess, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(8.dp))
                            Text(
                                "Official Verified Citizen", 
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, fontSize = 12.sp), 
                                color = KrdpassSuccess
                            )
                        }
                    }
                }
            }
            
            Spacer(Modifier.height(8.dp))

            // Personal Details Section
            Text(
                "Personal Details", 
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                modifier = Modifier.padding(bottom = 12.dp)
            )
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                PersonalDetailCard(
                    icon = Icons.Default.DateRange,
                    label = "Birth Date",
                    value = birthdate ?: "N/A",
                    modifier = Modifier.weight(1f)
                )
                PersonalDetailCard(
                    icon = Icons.Default.AccountCircle,
                    label = "Gender",
                    value = sex ?: "N/A",
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(Modifier.height(24.dp))
            
            // User Info Protocol
            UserInfoProtocolCard(
                isLoading = isLoadingUserInfo,
                onFetchUserInfo = onFetchUserInfo,
                userInfo = userInfo
            )
            
            Spacer(Modifier.height(16.dp))
            
            // Token Details
            TokenDetailsCard(
                idClaims = idClaims,
                accessClaims = accessClaims
            )
            
            Spacer(Modifier.height(16.dp))

            // Token Management Actions
            TokenManagementCard(
                loading = isLoadingUserInfo,
                onVerifyToken = onVerifyToken,
                onRefreshToken = onRefreshToken,
                onRevokeToken = onRevokeToken,
                actionMessage = actionMessage
            )
            
            Spacer(Modifier.height(32.dp))
        }
    }
}

@Composable
private fun TokenManagementCard(
    loading: Boolean = false,
    onVerifyToken: () -> Unit,
    onRefreshToken: () -> Unit,
    onRevokeToken: () -> Unit,
    actionMessage: String? = null
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Token Management", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurface)
            }
            
            actionMessage?.let {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 4.dp)) {
                    Icon(Icons.Default.Info, contentDescription = null, tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
                }
            }
            
            Spacer(Modifier.height(16.dp))
            
            Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onVerifyToken,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.secondaryContainer, contentColor = MaterialTheme.colorScheme.onSecondaryContainer),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Verify Token Signature", style = MaterialTheme.typography.labelLarge)
                }

                Button(
                    onClick = onRefreshToken,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer, contentColor = MaterialTheme.colorScheme.onTertiaryContainer),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Refresh Access Token", style = MaterialTheme.typography.labelLarge)
                }

                Button(
                    onClick = onRevokeToken,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.errorContainer, contentColor = MaterialTheme.colorScheme.onErrorContainer),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Revoke Token (Log Out)", style = MaterialTheme.typography.labelLarge)
                }
            }
        }
    }
}

@Composable
private fun ProfileImage(url: String?) {
    Box(
        modifier = Modifier.size(56.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
        contentAlignment = Alignment.Center
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(url).crossfade(true).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize()
            )
        } else {
            Icon(Icons.Default.Person, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp))
        }
    }
}

@Composable
private fun PersonalDetailCard(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(8.dp))
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f))
            }
            Spacer(Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun UserInfoProtocolCard(
    isLoading: Boolean,
    onFetchUserInfo: () -> Unit,
    userInfo: KrdpassUserInfo?
) {
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Remote User Info Protocol", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.weight(1f))
                Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
            }

            AnimatedVisibility(visible = expanded) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    Text(
                        "Fetch the latest profile data directly from the OIDC UserInfo endpoint using your Access Token.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f),
                        modifier = Modifier.padding(bottom = 16.dp)
                    )

                    Button(
                        onClick = onFetchUserInfo, 
                        modifier = Modifier.fillMaxWidth().height(52.dp), 
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primaryContainer, contentColor = MaterialTheme.colorScheme.onPrimaryContainer),
                        enabled = !isLoading
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                            Spacer(Modifier.width(8.dp))
                            Text("Syncing...", style = MaterialTheme.typography.labelLarge)
                        } else {
                            Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Sync with Remote UserInfo", style = MaterialTheme.typography.labelLarge)
                        }
                    }

                    if (userInfo != null) {
                        Spacer(Modifier.height(16.dp))
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(KrdpassSuccess.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                                .padding(12.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = KrdpassSuccess, modifier = Modifier.size(18.dp))
                                Spacer(Modifier.width(8.dp))
                                Text("Successfully synced!", style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold), color = KrdpassSuccess)
                            }
                        }
                        
                        Spacer(Modifier.height(12.dp))
                        ClaimSection("UserInfo Claims", userInfo.raw)
                    }
                }
            }
        }
    }
}

@Composable
private fun TokenDetailsCard(
    idClaims: Map<String, Any?>,
    accessClaims: Map<String, Any?>
) {
    var expanded by remember { mutableStateOf(false) }
    
    Card(
        modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)),
        elevation = CardDefaults.cardElevation(0.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(12.dp))
                Text("Token Details", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.weight(1f))
                Icon(if (expanded) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown, contentDescription = null, modifier = Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.4f))
            }

            AnimatedVisibility(visible = expanded) {
                Column(modifier = Modifier.padding(top = 16.dp)) {
                    ClaimSection("ID Token Claims", idClaims)
                    Spacer(Modifier.height(12.dp))
                    ClaimSection("Access Token Claims", accessClaims)
                }
            }
        }
    }
}

@Composable
private fun ClaimSection(title: String, data: Map<String, Any?>) {
    Column {
        Text(title, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
        ) {
            Column(modifier = Modifier.padding(12.dp)) {
                data.forEach { (k, v) ->
                    Row(modifier = Modifier.padding(vertical = 2.dp)) {
                        Text(
                            "$k:", 
                            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold, fontSize = 11.sp), 
                            modifier = Modifier.width(100.dp),
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            v.toString(), 
                            style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), 
                            modifier = Modifier.weight(1f),
                            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.8f)
                        )
                    }
                }
            }
        }
    }
}
