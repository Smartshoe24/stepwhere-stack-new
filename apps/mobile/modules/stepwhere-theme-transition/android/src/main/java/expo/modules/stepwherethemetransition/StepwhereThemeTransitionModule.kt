package expo.modules.stepwherethemetransition

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StepwhereThemeTransitionModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var overlayView: StepwhereThemeTransitionOverlayView? = null

  override fun definition() = ModuleDefinition {
    Name("StepwhereThemeTransition")

    AsyncFunction("prepare") { cx: Double, cy: Double, overlayColor: String?, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_THEME_TRANSITION_ACTIVITY", "Current activity is not available.", null)
        return@AsyncFunction
      }

      val rootView = activity.window?.decorView as? ViewGroup
      if (rootView == null || rootView.width <= 0 || rootView.height <= 0) {
        promise.reject("ERR_THEME_TRANSITION_ROOT", "Window root view is not ready for capture.", null)
        return@AsyncFunction
      }

      removeOverlay()
      captureWindowBitmap(activity, rootView) { bitmap ->
        if (bitmap == null) {
          promise.reject("ERR_THEME_TRANSITION_CAPTURE", "Failed to capture the current screen.", null)
          return@captureWindowBitmap
        }

        val overlay = StepwhereThemeTransitionOverlayView(activity).apply {
          layoutParams = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT,
          )
          setOverlayColor(parseColorOrDefault(overlayColor))
          setRevealCenter(cx.toFloat(), cy.toFloat())
          setSnapshot(bitmap)
        }

        rootView.addView(overlay)
        overlayView = overlay
        promise.resolve(null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("commit") { durationMs: Int, promise: Promise ->
      val overlay = overlayView
      if (overlay == null) {
        promise.reject("ERR_THEME_TRANSITION_OVERLAY", "No prepared overlay is available.", null)
        return@AsyncFunction
      }

      overlay.startReveal(durationMs.toLong()) {
        removeOverlay()
        promise.resolve(null)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancel") {
      removeOverlay()
    }.runOnQueue(Queues.MAIN)

    OnActivityEntersBackground {
      removeOverlay()
    }

    OnDestroy {
      removeOverlay()
    }
  }

  private fun captureWindowBitmap(
    activity: Activity,
    rootView: View,
    callback: (Bitmap?) -> Unit
  ) {
    val width = rootView.width
    val height = rootView.height

    if (width <= 0 || height <= 0) {
      callback(null)
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      PixelCopy.request(activity.window, bitmap, { result ->
        if (result == PixelCopy.SUCCESS) {
          callback(bitmap)
        } else {
          callback(drawViewBitmap(rootView, width, height))
        }
      }, mainHandler)
      return
    }

    callback(drawViewBitmap(rootView, width, height))
  }

  private fun drawViewBitmap(rootView: View, width: Int, height: Int): Bitmap {
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    rootView.draw(canvas)
    return bitmap
  }

  private fun parseColorOrDefault(color: String?): Int {
    return try {
      if (color.isNullOrBlank()) Color.TRANSPARENT else Color.parseColor(color)
    } catch (_: IllegalArgumentException) {
      Color.TRANSPARENT
    }
  }

  private fun removeOverlay() {
    overlayView?.let { overlay ->
      overlay.cancelAnimation()
      (overlay.parent as? ViewGroup)?.removeView(overlay)
      overlay.release()
    }
    overlayView = null
  }
}
