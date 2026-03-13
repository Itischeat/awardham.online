import "dotenv/config";
import { Bot, Keyboard } from "grammy";
import { MemoryStorage } from "./share/memory-storage.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const creatorChatId = process.env.CREATOR_CHAT_ID;


if (!token || !creatorChatId) {
    throw new Error("TELEGRAM_BOT_TOKEN or CREATOR_CHAT_ID is not defined");
}

try {
    const bot = new Bot(token);
    const storage = await MemoryStorage.new();

    const keyboard = new Keyboard().resized()
        .text("⭐️ Оставить отзыв").text("🚨 Сообщить об ошибке").row()
        .text("💡 Предложить что улучшить");

    bot.on("message:text", async (ctx) => {
        const text = ctx.msg.text;

        switch (text) {
            case ("/start"):
                ctx.reply(`
            Приветствую в чат-боте по проекту awardham.online!\n
Здесь вы можете оставить отзыв, сообщить об ошибке или предложить что улучшить.`, { reply_markup: keyboard });
                break;
            case ("⭐️ Оставить отзыв"):
                await storage.set(ctx.chat.id.toString(), {
                    state: "review",
                });
                ctx.reply("Введите отзыв");
                break;
            case ("🚨 Сообщить об ошибке"):
                await storage.set(ctx.chat.id.toString(), {
                    state: "error",
                });
                ctx.reply("Введите сообщение об ошибке");
                break;
            case ("💡 Предложить что улучшить"):
                await storage.set(ctx.chat.id.toString(), {
                    state: "suggestion",
                });
                ctx.reply("Введите предложение");
                break;
            default:
                const state = await storage.get(ctx.chat.id.toString());
                if (!state) {
                    ctx.reply("Введите команду /start");
                    break;
                }
                switch (state.state) {
                    case "review":
                        bot.api.sendMessage(creatorChatId, `Отзыв от ${ctx.chat.username}: ${ctx.msg.text}`);
                        ctx.reply("Спасибо за отзыв!");
                        await storage.delete(ctx.chat.id.toString());
                        break;
                    case "error":
                        bot.api.sendMessage(creatorChatId, `Ошибка от ${ctx.chat.username}: ${ctx.msg.text}`);
                        ctx.reply("Спасибо за сообщение об ошибке!");
                        await storage.delete(ctx.chat.id.toString());
                        break;
                    case "suggestion":
                        bot.api.sendMessage(creatorChatId, `Предложение от ${ctx.chat.username}: ${ctx.msg.text}`);
                        ctx.reply("Спасибо за предложение!");
                        await storage.delete(ctx.chat.id.toString());
                        break;
                }
        }
    });

    bot.start();
} catch (err) {
    console.error(err);
}