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

    const data = await response.json();

    preview.value = data.translation;
});
