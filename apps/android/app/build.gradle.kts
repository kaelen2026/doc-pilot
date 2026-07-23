plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
}

android {
  namespace = "dev.w3ctech.docpilot"
  compileSdk = 36

  defaultConfig {
    applicationId = "dev.w3ctech.docpilot"
    minSdk = 31
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    vectorDrawables.useSupportLibrary = true
    buildConfigField("String", "API_BASE_URL", "\"${providers.gradleProperty("DOC_PILOT_API_URL").orElse("http://10.0.2.2:3001").get()}\"")
  }

  buildTypes {
    release {
      isMinifyEnabled = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }

  buildFeatures {
    compose = true
    buildConfig = true
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions.jvmTarget = "17"
  packaging.resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
}

dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2026.06.00")
  implementation(composeBom)
  androidTestImplementation(composeBom)
  implementation("androidx.activity:activity-compose:1.13.0")
  implementation("androidx.core:core-ktx:1.18.0")
  implementation("androidx.compose.material3:material3")
  implementation("androidx.compose.material:material-icons-extended")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.ui:ui-tooling-preview")
  debugImplementation("androidx.compose.ui:ui-tooling")
  implementation("androidx.lifecycle:lifecycle-runtime-compose:2.10.0")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.10.0")
  implementation("androidx.navigation:navigation-compose:2.9.6")
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
  implementation("com.squareup.okhttp3:okhttp:5.3.2")
  implementation("androidx.security:security-crypto:1.1.0")
  implementation("com.google.firebase:firebase-messaging:25.0.1")

  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
  testImplementation("com.squareup.okhttp3:mockwebserver:5.3.2")
  androidTestImplementation("androidx.test.ext:junit:1.3.0")
  androidTestImplementation("androidx.compose.ui:ui-test-junit4")
  debugImplementation("androidx.compose.ui:ui-test-manifest")
}
