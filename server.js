import "dotenv/config";
import { app } from "./api/index.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Todo app running at http://localhost:${PORT}`);
});