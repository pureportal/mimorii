import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

fun environmentString(name: String): String {
    val value = System.getenv(name) ?: ""
    return "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""
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
    implementation("androidx.core:core-ktx:1.16.0")
    implementation(project(":tauri-android"))
}
