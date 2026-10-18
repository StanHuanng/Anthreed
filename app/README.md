# Anthreed (App Module)

This directory contains the Flutter application source code for **Anthreed**.

## 📱 Features

*   **Dual Theme System**:
    *   **Parchment Mode**: Designed for long-form reading, featuring `Frank Ruhl Libre` serif font and a procedurally generated noise texture background.
    *   **Pitch Black Mode**: Optimized for OLED screens and low-light environments.
*   **Markdown Rendering**: High-fidelity rendering of technical articles including code blocks and tables.
*   **Offline Support**: Gracefully degrades to mock data when Supabase connection is unavailable.
*   **Cross-Platform**: Ready for Android, iOS, and Web.

## 🛠️ Setup & Run

### Prerequisites
*   Flutter SDK (Stable channel)
*   VS Code (Recommended) with Flutter extensions

### Running Locally

1.  **Get Dependencies**:
    ```bash
    flutter pub get
    ```

2.  **Start App**:
    *   **With Mock Data** (Default):
        ```bash
        flutter run
        ```
    *   **With Real Data (Supabase)**:
        Use the VS Code launch configuration **"Anthreed (Supabase Dev)"** or run:
        ```bash
        flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
        ```

## 📂 Project Structure

*   `lib/core`: Shared models, themes, and utilities.
*   `lib/features`: Feature-based architecture (Feed, Reader, Archive).
*   `lib/config`: App-wide configuration and environment variables.
