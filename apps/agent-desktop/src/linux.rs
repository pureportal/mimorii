pub fn running_as_root() -> bool {
    rustix::process::geteuid().is_root()
}
