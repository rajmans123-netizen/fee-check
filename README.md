# Fee Check

How much of your food or grocery delivery order was fees? Add a screenshot of the bill (Swiggy, Zomato, Blinkit, Zepto, Instamart…) and Fee Check splits what you paid into food, fees and taxes. Add a few and it adds up your fees, and tells you whether your membership pays for itself.

**Live:** https://rajmans123-netizen.github.io/fee-check/

- Reads the screenshot in your browser (tesseract.js). Nothing is uploaded.
- Nothing is hard-coded: fees differ by city, time and cart, so it only counts what's printed on your bill.
- OCR often misreads the ₹ sign; each amount gets a few possible readings and the bill's own arithmetic (item total + charges = grand total; grand total − discounts + round-off = paid) picks the right ones. If a bill doesn't add up, it says so, and you can tap any amount to fix it.

Run the tests: `node test/bill.test.mjs`

Built with Claude by [Raj Tries](https://instagram.com/raj_triess). MIT licence.
