const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: String,
  agentId: { type: String, default: null },
  name: String,
  email: { type: String, default: null },
  photo: {
    type: String,
    default: null,
  },
  phoneNumber: {
    type: String,
    default: null,
  },
  gender: Number,
  dob: {
    type: Date,
    default: null,
  },
  country: {
    type: String,
    default: null,
  },
  frame: {
    type: String,
    default: null,
  },
  audioRoomBackground: {
    type: String,
    default: null,
  },
  chatBubble: {
    type: String,
    default: null,
  },
  entry: {
    type: String,
    default: null,
  },
  password: {
    type: String,
    default: null,
  },
  beansCount: { type: Number, default: 0 },
  diamondsCount: { type: Number, default: 0 },
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  friends: { type: Number, default: 0 },
  role: { type: String, default: "user" },
  isVerified: { type: Boolean, default: false },
  token: { type: String, required: false },

  creatorBeans: {
    total: { type: Number, default: 0 },
    basic: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
  },
  isBanned: {
    type: Boolean,
    default: false,
  },
  pinnedRooms: {
    type: [String],
    default: null,
  },
  isBanned:{
    type:Boolean,
    default:false,
  },
  bannedAt: {
    type: Date,
    default: null,
  },
  bannedPeriod: {
    type: String,
    default: null,
  },
  activeTime:{
    type:Number,
    default:0
  }
  
});
const User = mongoose.model("User", userSchema);
exports.User = User;
