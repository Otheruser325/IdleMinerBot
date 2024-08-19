module.exports = {
    name: 'hello',
    description: 'Says hello!',
    async execute(message) {
        await message.reply('Hello!');
    }
};
