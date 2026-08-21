import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

fun environmentString(name: String): String {
    val value = (System.getenv(name) ?: "").trim()
    return "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
}

val firebaseValues = listOf(
    "MIMORII_FIREBASE_API_KEY",
    "MIMORII_FIREBASE_APPLICATION_ID",
    "MIMORII_FIREBASE_PROJECT_ID",
    "MIMORII_FIREBASE_SENDER_ID"
).map { (System.getenv(it) ?: "").trim() }
require(firebaseValues.count { it.isNotEmpty() } in setOf(0, firebaseValues.size)) {
    "Configure all four MIMORII_FIREBASE_* values or leave all four unset"
}

android {
    namespace = "app.mimorii.push"
    compileSdk = 36

    defaultConfig {
        minSdk = 24
        buildConfigField("String", "MIMORII_FIREBASE_API_KEY", environmentString("MIMORII_FIREBASE_API_KEY"))
        buildConfigField(
            "String",
            "MIMORII_FIREBASE_APPLICATION_ID",
            environmentString("MIMORII_FIREBASE_APPLICATION_ID")
        )
        buildConfigField(
            "String",
            "MIMORII_FIREBASE_PROJECT_ID",
            environmentString("MIMORII_FIREBASE_PROJECT_ID")
        )
        buildConfigField(
            "String",
            "MIMORII_FIREBASE_SENDER_ID",
            environmentString("MIMORII_FIREBASE_SENDER_ID")
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }

    buildFeatures {
        buildConfig = true
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:34.17.0"))
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.firebase:firebase-installations")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation(project(":tauri-android"))
    testImplementation("androidx.test:core:1.7.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.robolectric:robolectric:4.16.1")
}
