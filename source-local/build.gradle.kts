plugins {
    id("mihon.library")
    kotlin("multiplatform")
}

kotlin {
    androidTarget()
    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(projects.sourceApi)

                implementation(libs.unifile)
            }
        }
        val androidMain by getting {
            dependencies {
                implementation(projects.core.archive)
                implementation(projects.core.common)
                implementation(projects.coreMetadata)

                // Move ChapterRecognition to separate module?
                implementation(projects.domain)

                implementation(kotlinx.bundles.serialization)
            }
        }
    }

    compilerOptions {
        freeCompilerArgs.addAll(
            "-Xexpect-actual-classes",
            "-opt-in=kotlinx.serialization.ExperimentalSerializationApi",
        )
    }
}

android {
    namespace = "tachiyomi.source.local"

    defaultConfig {
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        consumerProguardFiles("consumer-rules.pro")
    }

    dependencies {
        // FFmpeg-kit
        implementation(aniyomilibs.ffmpeg.kit)
    }
}
