const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/translate", async (req, res) => {
    try {
        const { text } = req.body;

        // දැනට test response එකක්
        res.json({
            translation: text
        });

    } catch (err) {
        res.status(500).json({
            error: err.message
        });
    }
});

app.listen(3000, () => {
    console.log("Server Started");
});
