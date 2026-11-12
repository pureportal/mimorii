use super::{DEFAULT_SERVER_URL, window_icon};

#[test]
fn server_url_uses_the_mimorii_api_by_default() {
    assert_eq!(DEFAULT_SERVER_URL, "https://mimorii.app/api");
}

#[test]
fn application_icon_is_valid() {
    let icon = window_icon();
    assert!(icon.width > 0);
    assert!(icon.height > 0);
    assert_eq!(icon.rgba.len(), (icon.width * icon.height * 4) as usize);
}
