const { mongoose } = require('./room');

const musicDataSchema = new mongoose.Schema({
    roomId: String,
    currentSong: String,
    isPlaying: { type: Boolean, default: false },
    duration: { type: Number, default: 0 },
    playlist: [String],
    shuffle: { type: Boolean, default: false },
    repeat: { type: Boolean, default: false },
}, {
    timestamps: true,
});

const MusicData = mongoose.model('MusicData', musicDataSchema);

module.exports = { MusicData };