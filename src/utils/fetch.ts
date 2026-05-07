import axios from "axios";

export async function fetchHTML(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 web2md"
      }
    });

    return response.data;
  } catch (error: any) {
    console.error("Failed to fetch URL");

    if (error.response) {
      console.error("Status:", error.response.status);
    } else {
      console.error(error.message);
    }

    process.exit(1);
  }
}