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
