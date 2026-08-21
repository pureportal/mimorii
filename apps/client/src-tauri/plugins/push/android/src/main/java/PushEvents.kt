package app.mimorii.push

import java.lang.ref.WeakReference

object PushEvents {
  @Volatile
  private var plugin = WeakReference<PushPlugin>(null)

  fun attach(value: PushPlugin) {
    plugin = WeakReference(value)
  }

  fun registrationChanged() {
    plugin.get()?.registrationChanged()
  }
}
