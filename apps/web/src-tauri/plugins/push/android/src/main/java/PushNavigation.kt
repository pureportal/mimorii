package app.mimorii.push

object PushNavigation {
  const val DEFAULT_PATH = "/app/operations/incidents"

  fun path(value: String?): String? =
    value?.takeIf { it.matches(Regex("^/app(?:/.*)?$")) }
}
