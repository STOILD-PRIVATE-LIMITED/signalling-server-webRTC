const { Room } = require('./models/room');

function generateId(length = 6) {
    const characters = '0123456789';
    let roomId = '';

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        if (randomIndex < 1 && i === 0) i--;
        else {
            roomId += characters[randomIndex];
        }
    }

    return roomId;
}

async function generateUniqueRoomId() {
    let roomId = generateId();
    while (await Room.findOne({ roomId })) {
        roomId = generateId();
    }
    return roomId;
}

module.exports = { generateUniqueRoomId };