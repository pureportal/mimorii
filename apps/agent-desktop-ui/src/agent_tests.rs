use super::concise_error;

#[test]
fn errors_keep_the_headline_and_the_root_cause() {
    assert_eq!(
        concise_error(
            "Error: GitHub's latest release could not be requested\n\nCaused by:\n    0: error sending request for url (https://api.github.com/repos/pureportal/mimorii/releases/latest)\n    1: client error (Connect)\n    2: dns error\n    3: No such host is known. (os error 11001)\n"
        ),
        "GitHub's latest release could not be requested: No such host is known. (os error 11001)"
    );
    assert_eq!(
        concise_error("Error: diagnostics found 1 problem\n"),
        "diagnostics found 1 problem"
    );
    assert_eq!(
        concise_error("Error: agent key was rejected\n\nCaused by:\n    agent key was rejected"),
        "agent key was rejected"
    );
}
