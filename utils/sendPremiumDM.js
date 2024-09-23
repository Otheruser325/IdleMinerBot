module.exports = async function sendPremiumDM(user) {
  const premiumMessage = `
    **Congratulations for going Premium!**
    
    You have received:
    - **1,000** Super Cash
    - **Permanent 2x Idle/Work Cash**
    - **Long x2 Boost** (12 hours)
    - **x10 Boost** (1 hour)
    
    You've also unlocked access to **exclusive commands**! Enjoy your new perks!
  `;

  try {
    await user.send(premiumMessage);
  } catch (error) {
    console.error('Error sending DM:', error);
  }
};