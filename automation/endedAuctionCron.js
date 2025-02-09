import cron from "node-cron";
import { Auction } from "../models/auctionSchema.js";
import { User } from "../models/userSchema.js";
import { Bid } from "../models/bidSchema.js";
import { sendEmail } from "../utils/sendEmail.js";
import { calculateCommission } from "../controllers/commissionController.js";

export const endedAuctionCron = () => {
  cron.schedule("*/1 * * * *", async () => {
    const now = new Date();
    console.log("Cron for ended auction running...");
    const endedAuctions = await Auction.find({
      endTime: { $lt: now },
      commissionCalculated: false,
    });
    for (const auction of endedAuctions) {
      try {
        const commissionAmount = await calculateCommission(auction._id);
        auction.commissionCalculated = true;
        const highestBidder = await Bid.findOne({
          auctionItem: auction._id,
          amount: auction.currentBid,
        });
        const auctioneer = await User.findById(auction.createdBy);
        auctioneer.unpaidCommission = commissionAmount;
        if (highestBidder) {
          auction.highestBidder = highestBidder.bidder.id;
          await auction.save();
          const bidder = await User.findById(highestBidder.bidder.id);
          await User.findByIdAndUpdate(
            bidder._id,
            {
              $inc: {
                moneySpent: highestBidder.amount,
                auctionsWon: 1,
              },
            },
            { new: true }
          );
          await User.findByIdAndUpdate(
            auctioneer._id,
            {
              $inc: {
                unpaidCommission: commissionAmount,
              },
            },
            { new: true }
          );
          const subject = `Congratulations! You won the auction for ${auction.title}`;
          const message = `Dear ${bidder.userName},

Congratulations! You have won the auction for "${auction.title}".

Before proceeding with the payment, please contact your auctioneer at ${auctioneer.email} for any questions or concerns.

To complete your payment, choose one of the following methods:

1. **Bank Transfer**:
   - Account Name: ${auctioneer.paymentMethods.bankTransfer.bankAccountName}
   - Account Number: ${auctioneer.paymentMethods.bankTransfer.bankAccountNumber}
   - Bank: ${auctioneer.paymentMethods.bankTransfer.bankName}

2. **UPI**:
   - Send payment via UPI to: ${auctioneer.paymentMethods.upiId}

3. **Cash on Delivery (COD)**:
   - For COD, please pay 20% of the total amount upfront using any of the methods above.
   - The remaining 80% will be due upon delivery.
   - If you’d like to inspect the auction item, please email ${auctioneer.email} to arrange a viewing.

Please ensure your payment is completed. Once payment is confirmed, your item will be shipped.

Thank you for your participation!

Best regards,  
Bidstorm`;

          console.log("SENDING EMAIL TO HIGHEST BIDDER");
          sendEmail({ email: bidder.email, subject, message });
          console.log("SUCCESSFULLY EMAIL SEND TO HIGHEST BIDDER");
        } else {
          await auction.save();
        }
      } catch (error) {
        return next(console.error(error || "Some error in ended auction cron"));
      }
    }
  });
};