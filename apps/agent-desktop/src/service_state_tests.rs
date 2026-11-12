use super::ServiceState;
use crate::terminal::Tone;

#[test]
fn systemd_states_map_to_service_states() {
    assert_eq!(ServiceState::from_systemd("active"), ServiceState::Running);
    assert_eq!(
        ServiceState::from_systemd("activating"),
        ServiceState::Starting
    );
    assert_eq!(
        ServiceState::from_systemd("deactivating"),
        ServiceState::Stopping
    );
    assert_eq!(ServiceState::from_systemd("failed"), ServiceState::Failed);
    assert_eq!(
        ServiceState::from_systemd("inactive"),
        ServiceState::Stopped
    );
}

#[test]
fn states_have_labels_and_tones() {
    assert_eq!(ServiceState::NotInstalled.label(), "Not installed");
    assert_eq!(ServiceState::Running.tone(), Tone::Success);
    assert_eq!(ServiceState::Starting.tone(), Tone::Warning);
    assert_eq!(ServiceState::Failed.tone(), Tone::Danger);
}
