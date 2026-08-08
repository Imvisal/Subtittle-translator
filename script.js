const fileInput = document.getElementById("subtitleFile");
const preview = document.getElementById("preview");

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e){
        preview.value = e.target.result;
    }

    reader.readAsText(file);
});

const translateBtn = document.getElementById("translateBtn");

translateBtn.addEventListener("click", async () => {
    const text = preview.value;

    const response = await fetch("https://YOUR-BACKEND-URL/translate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            text: text,
            source: "en",
            target: "si"
        })
    });

    translateBtn.addEventListener("click", async () => {
    const text = preview.value;

    if (!text.trim()) {
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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Translation failed");
        }

        preview.value = data.translation;

    } catch (error) {
        alert(error.message);
    }

    translateBtn.disabled = false;
    translateBtn.textContent = "Translate Subtitle";
});

    const data = await response.json();

    preview.value = data.translation;
});
