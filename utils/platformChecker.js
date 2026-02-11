import axios from "axios";
import * as cheerio from "cheerio";

// Returns { handle: string | null, status: number }
export const getHandleFromLink = async (url, platform) => {
    try {
        const cleanUrl = url.trim();

        // --- MOJ (Regex - 100% Reliable) ---
        if (platform === "Moj") {
            try {
                const urlObj = new URL(cleanUrl);
                const path = urlObj.pathname; 
                const match = path.match(/@([a-zA-Z0-9_.]+)/);
                if (match) return { handle: match[1], status: 200 };
                return { handle: null, status: 404 }; // Pattern didn't match
            } catch (e) {
                return { handle: null, status: 400 }; // Invalid URL
            }
        }

        // --- SHARECHAT (Scraping) ---
        if (platform === "ShareChat") {
            try {
                const { data } = await axios.get(cleanUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Referer': 'https://www.google.com/'
                    },
                    timeout: 4000 
                });

                const $ = cheerio.load(data);
                let foundHandle = null;

                // Strategy 1: OpenGraph
                const ogUrl = $('meta[property="og:url"]').attr('content');
                if (ogUrl && ogUrl.includes("/profile/")) {
                    const parts = ogUrl.split("/profile/");
                    if (parts[1]) foundHandle = parts[1].split("/")[0];
                }

                // Strategy 2: JSON-LD
                if (!foundHandle) {
                    const jsonLd = $('script[type="application/ld+json"]').html();
                    if (jsonLd) {
                        const jsonData = JSON.parse(jsonLd);
                        if (jsonData.author && jsonData.author.url) {
                            const parts = jsonData.author.url.split("/profile/");
                            if (parts[1]) foundHandle = parts[1].split("/")[0];
                        }
                    }
                }

                if (foundHandle) return { handle: foundHandle, status: 200 };
                
                // If we got 200 OK but couldn't find handle, it's likely a structure change or weird page
                return { handle: null, status: 200 }; 

            } catch (error) {
                // BUG FIX #6: Distinguish 404 from Blocked/Network Error
                if (error.response && error.response.status === 404) {
                    return { handle: null, status: 404 }; // Definitely a bad link
                }
                // For 403 (Blocked), 500, or Network Error -> Return specific status
                return { handle: null, status: error.response?.status || 500 }; 
            }
        }

        return { handle: null, status: 400 };
    } catch (error) {
        return { handle: null, status: 500 };
    }
};

// Sync Helper (unchanged)
export const extractUsernameFromProfileUrl = (url, platform) => {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname;
        if (platform === "Moj") {
            const match = path.match(/@([a-zA-Z0-9_.]+)/);
            return match ? match[1] : null;
        }
        if (platform === "ShareChat") {
            if (path.includes("/profile/")) {
                const parts = path.split("/profile/");
                return parts[1] ? parts[1].split("/")[0] : null;
            }
        }
        return null;
    } catch (e) {
        return null;
    }
};