use eframe::egui::{self, Align, Layout, RichText};

use crate::agent::{Request, Task};
use crate::app::AgentApp;
use crate::theme::Palette;
use crate::widgets;

pub fn show(app: &mut AgentApp, ui: &mut egui::Ui) {
    let palette = Palette::of(ui);
    widgets::page_header(ui, "Network access", |ui| {
        let can_save = app.network_dirty && app.network.is_valid() && !app.is_busy();
        let label = if app.is_pending(Task::SaveNetworkAccess) {
            "Saving…"
        } else {
            "Save changes"
        };
        if widgets::primary_button(ui, label, can_save).clicked() {
            app.request(Request::SaveNetworkAccess(app.network.input()));
        }
        if app.network_dirty && widgets::secondary_button(ui, "Discard", !app.is_busy()).clicked() {
            app.reset_network_form();
        }
    });
    widgets::muted(
        ui,
        "Checks that target anything outside these limits fail without connecting.",
    );
    ui.add_space(14.0);

    let previous = app.network.clone();
    let cidr_error = app.network.cidr_error();
    let hostname_error = app.network.hostname_error();
    let protocol_error = app.network.protocol_error();
    let port_error = app.network.port_error();
    let form = &mut app.network;
    restriction(
        ui,
        palette,
        "IP addresses",
        "Limit to these CIDR ranges",
        &mut form.limit_ip_addresses,
        |ui| {
            widgets::text_field(
                ui,
                "Allowed CIDRs",
                &mut form.allowed_cidrs,
                "192.168.1.0/24, 10.0.0.12/32",
                false,
                cidr_error,
            );
        },
    );
    restriction(
        ui,
        palette,
        "Hostnames",
        "Limit to these hostnames",
        &mut form.limit_hostnames,
        |ui| {
            widgets::text_field(
                ui,
                "Allowed hostnames",
                &mut form.allowed_hostnames,
                "*.internal.example, status.example.com",
                false,
                hostname_error,
            );
        },
    );
    restriction(
        ui,
        palette,
        "Protocols",
        "Limit to selected protocols",
        &mut form.limit_protocols,
        |ui| {
            ui.horizontal_wrapped(|ui| {
                for (selected, label) in [
                    (&mut form.http, "HTTP"),
                    (&mut form.https, "HTTPS"),
                    (&mut form.tcp, "TCP"),
                    (&mut form.icmp, "ICMP"),
                ] {
                    if widgets::chip(ui, *selected, label).clicked() {
                        *selected = !*selected;
                    }
                }
            });
            if let Some(error) = protocol_error {
                ui.label(RichText::new(error).size(12.5).color(palette.danger));
            }
        },
    );
    restriction(
        ui,
        palette,
        "Ports",
        "Limit to these ports",
        &mut form.limit_ports,
        |ui| {
            widgets::text_field(
                ui,
                "Allowed ports",
                &mut form.allowed_ports,
                "80, 443, 5432",
                false,
                port_error,
            );
        },
    );
    if app.network != previous {
        app.network_dirty = true;
    }
}

fn restriction(
    ui: &mut egui::Ui,
    palette: Palette,
    title: &str,
    toggle: &str,
    limited: &mut bool,
    fields: impl FnOnce(&mut egui::Ui),
) {
    widgets::card(palette).show(ui, |ui| {
        ui.set_width(ui.available_width());
        ui.horizontal(|ui| {
            ui.vertical(|ui| {
                ui.label(RichText::new(title).strong().size(15.0).color(palette.text));
                if !*limited {
                    widgets::muted(ui, "All allowed");
                }
            });
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                widgets::switch(ui, limited, toggle);
            });
        });
        if *limited {
            ui.add_space(8.0);
            fields(ui);
        }
    });
    ui.add_space(12.0);
}
