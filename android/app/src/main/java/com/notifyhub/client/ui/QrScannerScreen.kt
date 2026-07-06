package com.notifyhub.client.ui

import android.Manifest
import android.graphics.Rect
import android.media.ToneGenerator
import android.media.AudioManager
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size as ComposeSize
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.gson.Gson
import com.google.gson.JsonSyntaxException
import com.notifyhub.client.data.i18n
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

data class QrConnectData(
    val serverUrl: String,
    val username: String = "",
    val password: String = "",
    val jwt: String? = null
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrScannerScreen(
    onResult: (QrConnectData) -> Unit,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    var hasCameraPermission by remember { mutableStateOf(false) }
    var scanComplete by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var scannedBounds by remember { mutableStateOf<Rect?>(null) }
    var imageWidth by remember { mutableIntStateOf(0) }
    var imageHeight by remember { mutableIntStateOf(0) }
    val scope = rememberCoroutineScope()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        if (!granted) errorMessage = i18n("qr_err_camera")
    }

    LaunchedEffect(Unit) {
        val perm = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA)
        if (perm == android.content.pm.PackageManager.PERMISSION_GRANTED) hasCameraPermission = true
        else permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(i18n("qr_title"), fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = i18n("qr_back"))
                    }
                }
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when {
                errorMessage != null -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        modifier = Modifier.padding(24.dp)
                    ) {
                        Text(errorMessage!!, style = MaterialTheme.typography.bodyLarge,
                            textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.error)
                        Button(onClick = onBack) { Text(i18n("qr_back")) }
                    }
                }
                hasCameraPermission -> {
                    CameraPreviewWithScanner(
                        onBarcodeScanned = { raw, bounds, imgW, imgH ->
                            if (scanComplete) return@CameraPreviewWithScanner
                            try {
                                val data = Gson().fromJson(raw, QrConnectData::class.java)
                                if (data.serverUrl.isNotBlank() && (data.jwt != null || data.username.isNotBlank())) {
                                    scanComplete = true
                                    scannedBounds = bounds
                                    imageWidth = imgW
                                    imageHeight = imgH
                                    // Play beep sound
                                    try {
                                        val tg = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 100)
                                        tg.startTone(ToneGenerator.TONE_PROP_ACK, 200)
                                        tg.release()
                                    } catch (_: Exception) {}
                                    // Delay 1s to show QR bounds, then return result
                                    scope.launch {
                                        delay(1000L)
                                        onResult(data)
                                    }
                                }
                            } catch (_: JsonSyntaxException) {}
                        },
                        scannedBounds = scannedBounds,
                        imageWidth = imageWidth,
                        imageHeight = imageHeight,
                        modifier = Modifier.fillMaxSize()
                    )
                    if (!scanComplete) {
                        Box(
                            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 48.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.85f))
                                .padding(horizontal = 20.dp, vertical = 12.dp)
                        ) {
                            Text(i18n("qr_hint"), style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface)
                        }
                    }
                }
                else -> CircularProgressIndicator()
            }
        }
    }
}

@Composable
private fun CameraPreviewWithScanner(
    onBarcodeScanned: (String, Rect, Int, Int) -> Unit,
    scannedBounds: Rect?,
    imageWidth: Int,
    imageHeight: Int,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    var previewWidthPx by remember { mutableIntStateOf(0) }
    var previewHeightPx by remember { mutableIntStateOf(0) }

    DisposableEffect(Unit) { onDispose { cameraExecutor.shutdown() } }

    Box(modifier = modifier) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val future = ProcessCameraProvider.getInstance(ctx)
                future.addListener({
                    val provider = future.get()
                    val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                    val analysis = ImageAnalysis.Builder()
                        .setTargetResolution(Size(1280, 720))
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    val scanner = BarcodeScanning.getClient()
                    analysis.setAnalyzer(cameraExecutor) { proxy ->
                        val img = proxy.image
                        if (img != null) {
                            scanner.process(InputImage.fromMediaImage(img, proxy.imageInfo.rotationDegrees))
                                .addOnSuccessListener { codes ->
                                    for (bc in codes) {
                                        val raw = bc.rawValue
                                        val bounds = bc.boundingBox
                                        if (raw != null && bc.format == Barcode.FORMAT_QR_CODE && bounds != null) {
                                            onBarcodeScanned(raw, bounds, img.width, img.height)
                                        }
                                    }
                                }
                                .addOnCompleteListener { proxy.close() }
                        } else proxy.close()
                    }
                    try {
                        provider.unbindAll()
                        provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    } catch (_: Exception) {}
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
            modifier = Modifier.fillMaxSize().onGloballyPositioned { coords ->
                previewWidthPx = coords.size.width
                previewHeightPx = coords.size.height
            }
        )

        // Draw bounding box overlay when QR code is detected
        if (scannedBounds != null && imageWidth > 0 && imageHeight > 0) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val scaleX = size.width / imageWidth.toFloat()
                val scaleY = size.height / imageHeight.toFloat()
                val left = scannedBounds.left * scaleX
                val top = scannedBounds.top * scaleY
                val right = scannedBounds.right * scaleX
                val bottom = scannedBounds.bottom * scaleY
                drawRoundRect(
                    color = Color(0xFF4CAF50),
                    topLeft = Offset(left, top),
                    size = ComposeSize(right - left, bottom - top),
                    cornerRadius = CornerRadius(12f, 12f),
                    style = Stroke(width = 6f)
                )
            }
        }
    }
}
