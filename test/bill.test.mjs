// node test/bill.test.mjs : the bill reader on made-up bills, clean and with the OCR mistakes seen on real screenshots
import { readBill, summary } from '../bill.js';
let n = 0, fails = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL', m); } };
const near = (a, b) => Math.abs(a - b) < 0.011;
// a food bill, read cleanly
let b = readBill('Bill Summary\nItem total ₹640.00\nGST (govt. taxes) ₹32.00\nRestaurant packaging charges ₹30.00\nDelivery partner fee ₹45.00\nPlatform fee ₹14.90\nGrand total ₹761.90\nPaid ₹762.00');
ok(b.ok && b.food === 640 && near(b.feeTotal, 89.9) && b.tax === 32 && near(b.round, 0.1), 'clean food bill: ' + JSON.stringify(b.fees));
// the same kind of bill with the ₹ sign misread (%, =, F, ¥, a leading 7), a struck "FREE" fee, a dot lost, a round-off with a stray 7
b = readBill('Order details\n1 x Paneer wrap 2319\nBill Summary\nItem total %640.00\nGST (govt. taxes) 732.00\nRestaurant packaging charges =30.00\nDelivery partner fee =45-00 FREE\nPlatform fee 714.90\nPay on delivery fee 730.00\nGrand total F746.90\nCash round off 70.10\nPaid ¥747.00');
ok(b.ok && b.food === 640 && b.tax === 32 && b.fees.cod === 30 && b.fees.delivery === 0 && b.waived === 45 && near(b.feeTotal, 74.9), 'misread ₹ signs + FREE fee: ' + JSON.stringify(b));
ok(!b.fees.surge, 'a dish line above the bill is not a fee');
// "Multigrain" has "rain" in it; "Order was delivered" is not a delivery fee
b = readBill('Order was delivered 4\n1 x Multigrain wrap 305\nBill details\nItem total ₹305.00\nDelivery fee ₹25.00\nTo pay ₹330.00');
ok(b.ok && !b.fees.surge && b.fees.delivery === 25 && b.food === 305, 'no rain fee from "Multigrain": ' + JSON.stringify(b.fees));
// a struck-out item total read as garbage: worked out from the grand total
b = readBill('Bill Summary\nItem total 2482100 717352.00\nGST (govt. taxes) £60.00\nPlatform fee =14.90\nGrand total ¥1274.90');
ok(b.food === 1200 && b.ok, 'garbled item total from the grand total: ' + b.food);
// a reduced fee (₹36 -> ₹19), a coupon with a code, membership fee
b = readBill('Bill Summary\nItem total =540.00\nGST (govt. taxes) $27.00\nDelivery partner fee =36.00 19.00\nPlatform fee ¥12.50\nGold subscription fee 71.00\nGrand total ¥599.50\nCoupon applied - GET150 - ¥150.00\nCash round off 70.50\nPaid ¥450.00');
ok(b.ok && b.fees.delivery === 19 && b.waived === 17 && b.discounts === 150 && b.fees.membership === 1, 'reduced fee, coupon code not an amount, ₹1 membership fee: ' + JSON.stringify(b));
// quick commerce wording
b = readBill('Bill details\nItems total ₹412\nDelivery charge ₹30\nHandling charge ₹11\nSmall cart charge ₹20\nLate night fee ₹15\nGrand total ₹488');
ok(b.ok && b.fees.handling === 11 && b.fees.smallcart === 20 && b.fees.surge === 15 && b.fees.delivery === 30, 'grocery app fees, no decimals: ' + JSON.stringify(b.fees));
// "GST and restaurant charges" and a tip (shown apart from fees)
b = readBill('Bill Details\nItem Total ₹199\nDelivery Fee | 2.4 kms ₹38\nDelivery Tip ₹20\nPlatform fee ₹14.90\nGST and Restaurant Charges ₹19.45\nTo Pay ₹291.35');
ok(b.ok && b.tip === 20 && b.tax === 19.45 && near(b.feeTotal, 52.9), 'tip apart, distance in the label ignored: ' + JSON.stringify(b));
// several bills
const s = summary([readBill('Bill details\nItem total ₹100.00\nDelivery fee ₹30.00\nTo pay ₹130.00'), readBill('Bill details\nItem total ₹200.00\nDelivery fee ₹40.00 FREE\nPlatform fee ₹10.00\nTo pay ₹210.00')]);
ok(s.n === 2 && s.food === 300 && s.feeTotal === 40 && s.waived === 40 && s.paid === 340, 'summary of two bills: ' + JSON.stringify(s));
// nothing bill-like
b = readBill('Your order is on the way\nTrack order');
ok(b.food == null && b.feeTotal === 0, 'a screenshot with no bill');
console.log(`${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
