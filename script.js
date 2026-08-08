const fileInput = document.getElementById("subtitleFile");
const preview = document.getElementById("preview");
const translateBtn = document.getElementById("translateBtn");
const downloadBtn = document.getElementById("downloadBtn");

let translatedSubtitle = "";

// ===============================
// READ SRT FILE
// ===============================

fileInput.addEventListener("change", () => {

    const file = fileInput.files[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".srt")) {
        alert("Please select an SRT file.");
        return;
    }

    const reader = new FileReader();

    reader.onload = function(event) {
        preview.value = event.target.result;
    };

    reader.onerror = function() {
        alert("Could not read the subtitle file.");
    };

    reader.readAsText(file, "UTF-8");
});


// ===============================
// TRANSLATE
// ===============================

translateBtn.addEventListener("click", async () => {

    const text = preview.value.trim();

    if (!text) {
        alert("Please upload an SRT file first.");
        return;
    }

    translateBtn.disabled = true;
    translateBtn.textContent = "Translating...";

    try {

        const response = await fetch("/api/translate", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                text: text
            })

        });

        const raw = await response.text();

        console.log("Server response:", raw);

        let data;

        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error(
                "Server returned an invalid response: " +
                raw.substring(0, 300)
            );
        }

        if (!response.ok) {
            throw new Error(
                data.error || "Translation failed"
            );
        }

        translatedSubtitle = data.translation;

        preview.value = translatedSubtitle;

        alert("Subtitle translated successfully!");


    } catch (error) {

        console.error(error);

        alert(error.message);

    } finally {

        translateBtn.disabled = false;
        translateBtn.textContent = "Translate Subtitle";

    }

});


// ===============================
// DOWNLOAD SRT
// ===============================

downloadBtn.addEventListener("click", () => {

    const text = preview.value.trim();

    if (!text) {
        alert("There is no subtitle to download.");
        return;
    }

    const blob = new Blob(
        [text],
        {
            type: "text/plain;charset=utf-8"
        }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "Sinhala-Subtitle.srt";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

});
