const missing = [];

for (let i = 0; i < subtitles.length; i++) {

    const translated =
        translationMap.get(i);

    if (
        translated === undefined ||
        !translated.trim()
    ) {
        missing.push(i);
    }
}

if (missing.length > 0) {

    return res.status(422).json({
        error: "Some subtitles were not translated.",
        missing
    });

}
