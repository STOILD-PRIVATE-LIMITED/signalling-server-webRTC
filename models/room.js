const mongoose = require("mongoose");

mongoose.connect("mongodb://0.0.0.0:27017/mastiplay1", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const roomSchema = new mongoose.Schema(
  {
    id: String,
    // admin: [String],
    admin: String,

    askBeforeJoining: { type: Boolean, default: false },
    roomType: Number,
    name: String,
    imgUrl: { type: String, default: null },
    announcement: { type: String, default: null },
    PRP_ONLY_ADMIN_CHAT: { type: Boolean, default: false },
    seatsLockingStatus: { type: [Boolean], default: Array(8).fill(true) },
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model("Room", roomSchema);

module.exports = { Room, mongoose };
