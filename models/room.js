const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/chats', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const roomSchema = new mongoose.Schema({
    id: String,
    admin: String,
    askBeforeJoining: { type: Boolean, default: false },
    roomType: Number,
    name: String,
    imgUrl: { type: String, default: null },
    announcement: { type: String, default: null },
}, {
    timestamps: true,
});

const Room = mongoose.model('Room', roomSchema);

module.exports = { Room };