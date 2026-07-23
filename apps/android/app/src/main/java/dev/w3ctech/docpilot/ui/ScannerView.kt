package dev.w3ctech.docpilot.ui

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

fun parseDeviceCode(raw: String): String? {
  val value = raw.trim()
  if (value.isEmpty()) return null
  val fromUrl = Regex("""^docpilot://device-login(?:\?[^#]*)?(?:#.*)?$""")
    .takeIf { it.matches(value) }
    ?.let { Regex("""(?:[?&])user_code=([^&#]+)""").find(value)?.groupValues?.get(1) }
    ?.let { java.net.URLDecoder.decode(it, Charsets.UTF_8) }
  return (fromUrl ?: value.takeIf { it.matches(Regex("[A-Za-z0-9-]{4,}")) })?.trim()
}

@Composable
fun ScannerView(modifier: Modifier = Modifier, onCode: (String) -> Unit) {
  val context = LocalContext.current
  val lifecycle = LocalLifecycleOwner.current
  val executor = remember { Executors.newSingleThreadExecutor() }
  val scanner = remember { BarcodeScanning.getClient() }
  DisposableEffect(Unit) {
    onDispose { scanner.close(); executor.shutdown() }
  }
  AndroidView(
    modifier = modifier,
    factory = {
      PreviewView(context).also { view ->
        ProcessCameraProvider.getInstance(context).addListener({
          val provider = ProcessCameraProvider.getInstance(context).get()
          val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
          val analysis = ImageAnalysis.Builder()
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
          analysis.setAnalyzer(executor) { proxy ->
            val image = proxy.image
            if (image == null) {
              proxy.close()
            } else {
              scanner.process(InputImage.fromMediaImage(image, proxy.imageInfo.rotationDegrees))
                .addOnSuccessListener { codes ->
                  codes.firstNotNullOfOrNull { it.rawValue?.let(::parseDeviceCode) }?.let(onCode)
                }
                .addOnCompleteListener { proxy.close() }
            }
          }
          provider.unbindAll()
          provider.bindToLifecycle(lifecycle, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
        }, ContextCompat.getMainExecutor(context))
      }
    },
  )
}
