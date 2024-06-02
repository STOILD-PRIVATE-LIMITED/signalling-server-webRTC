const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
var http = require("http");
const { exec } = require("child_process");
// const https = require("https");
const { channel } = require("diagnostics_channel");
const { MusicData } = require("./models/music_data");
const { User } = require("./models/user.js");
const {
  getSongDuration,
  getMusicData,
  play,
  pause,
  next,
  previous,
  changeSong,
  addSong,
  seek,
  getPlaylist,
  findMusicData,
} = require("./src/controllers/music.js");
var giftTimerDetails = {};

const app = express();
// app.use(express.static('public'));
app.use("/static", express.static(path.join(__dirname, "public")));
const port = 8080;

app.use(bodyParser.json());

const { Room } = require("./models/room");
const { generateUniqueRoomId } = require("./utils");

// Get rooms
app.get("/api/rooms", async (req, res) => {
  // // console.log("get Request on '/api/rooms'");
  const { id, userId } = req.query;
  try {
    let roomData;
    if (id) {
      roomData = await Room.findOne({ id });
    } else if (userId) {
      roomData = await Room.findOne({ admin: userId });
    }
    if (!roomData) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.status(200).json(roomData);
  } catch (error) {
    res.status(500).json({ error: `Internal server error ${error}` });
  }
});

// Create a new room
app.post("/api/rooms", async (req, res) => {
  // // console.log("post Request on ('/api/rooms')");
  let roomData = req.body;
  const { admin } = roomData;
  try {
    const existingRoom = await Room.findOne({ admin: admin });
    if (existingRoom) {
      return res
        .status(400)
        .json({ error: "Room for this user already exists" });
    }
    roomData.id = await generateUniqueRoomId();
    giftTimerDetails[roomData.id] = { isRunning: false };
    const newRoom = new Room(roomData);
    await newRoom.save();
    res.json(newRoom);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update an existing room
app.post("/api/update-room", async (req, res) => {
  // // console.log("post Request on '/api/update-room',");
  const { id } = req.body;
  try {
    const existingRoom = await Room.findOne({ id: id });
    if (!existingRoom) {
      // // console.log("Room not found with admin:", admin);
      return res.status(404).json({ error: "Room not found" });
    }
    await existingRoom.updateOne(req.body);
    res.json(existingRoom);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/api/make-admin", async (req, res) => {
  const { admin, id } = req.body;
  try {
    let existingRoom = await Room.findOne({ id });
    if (existingRoom === null) {
      return res.status(400).send("room not found");
    }
    if (!existingRoom.admin.includes(admin)) existingRoom.admin.push(admin);
    console.log("existingRoomafter", existingRoom);
    await existingRoom.save();
    res.send("admin added");
  } catch (e) {
    res.status(500).send(`Internal server error ${e}`);
  }
});

app.put("/api/change-room", async (req, res) => {
  try {
    let allRooms = await Room.find({});
    console.log("allRooms", allRooms);
    for (let room of allRooms) {
      // console.log("Array.isArray(room.admin)",Array.isArray(room.admin))
      // if(!Array.isArray(room.admin)){
      // if(room.admin.length===1){
      // console.log("entered",room.id)
      // room.admin=[room.admin]
      // console.log("room after change",room)

      await room.save();
      // }
      // }
    }
    res.send("room changed");
  } catch (e) {
    res.status(500).send(`Internal server error ${e}`);
  }
});

app.get("/api/rooms/all", async (req, res) => {
  // // console.log("get Request on '/api/rooms/all");
  try {
    const rooms = Object.keys(channels).map((channel) => ({
      channelId: channel,
      numSockets: Object.keys(channels[channel]).length,
    }));
    rooms.sort((a, b) => b.numSockets - a.numSockets);
    const { limit, start } = req.query;
    const startIndex = start ? parseInt(start, 10) : 0;
    const endIndex = limit ? startIndex + parseInt(limit, 10) : rooms.length;
    const paginatedRooms = rooms.slice(startIndex, endIndex);
    // console.log("detailedRooms12")
    let detailedRooms = await Promise.all(
      paginatedRooms.map(async (room) => {
        const roomData = await Room.findOne({ id: room.channelId });
        return roomData;
      })
    );
    detailedRooms = detailedRooms.filter((room) => room != null);
    // // console.log("paginatedRooms", detailedRooms);
    res.status(200).json(detailedRooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/update-server", async (req, res) => {
  // // console.log("Updating Server: ");
  const payload = req.body;
  if (
    (payload && payload.force && payload.force == true) ||
    (payload && payload.ref === "refs/heads/master")
  ) {
    exec("git reset --hard && git pull", (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        res.status(500).send("Internal Server Error");
        return;
      }
      // // console.log(`Git Pull Successful: ${stdout}`);
      res.status(200).send("Server Updated Successfully");
    });
  } else {
    res.status(200).send("Ignoring non-master branch push event");
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // console.log("query = ", req.query);
    // console.log("file = ", file)
    folder = req.query.folder;
    folder = `./public/${folder}`;
    try {
      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
        // console.log(`Folder '${folder}' Created Successfully.`);
      }
    } catch (err) {
      console.error("Unable to create folder:", err);
    }
    cb(null, folder);
  },
  filename: function (req, file, cb) {
    let originalName = file.originalname.replace(/ /g, "_");
    let extension = originalName.split(".")[1];
    // console.log("originalName:", originalName);
    // console.log("extension:", extension);
    cb(null, originalName);
  },
  limits: { fileSize: 10485760 /* 10 mb */ },
});

const upload = multer({ storage: storage });

app.route("/upload").post(upload.single("file"), async function (req, res) {
  res.send("File was uploaded successfully!");
  console.log("File is being uploaded!.");
  const name = req.file.originalname;
  const folder = req.query.folder;
  const roomId = folder;
  // updating the playlist of roomId with this song name
  let musicData = await findMusicData(roomId);
  if (musicData.playlist.indexOf(name) != -1) {
    musicData.playlist.push(name);
  }
  musicData.save();
  // console.log("Emitting music-started with file name:", name, "to room:", roomId);
  emitMusicChange(roomId);
});

app.post("/api/remove-song", async function (req, res) {
  const { roomId, song } = req.body;
  const folder = `./public/${roomId}`;
  const filePath = `${folder}/${song}`;
  try {
    fs.unlinkSync(filePath);
    let musicData = await findMusicData(roomId);
    musicData.playlist = musicData.playlist.filter((item) => item !== song);
    musicData.save();
    emitMusicChange(roomId);
    res.status(200).send("Song removed successfully");
  } catch (error) {
    res.status(500).send("Internal Server Error");
  }
});

async function emitMusicChange(roomId) {
  const musicData = await findMusicData(roomId);
  for (id in channels[roomId]) {
    channels[roomId][id].emit("music-started", musicData);
  }
}

app.get("/api/playlist", async (req, res) => {
  try {
    const files = await getPlaylist(req.query.roomId);
    res.status(500).json({
      err,
      files,
    });
  } catch (e) {
    res.status(500).json({
      err: e,
    });
  }
});

app.post("/api/play", async (req, res) => {
  await play(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/pause", async (req, res) => {
  await pause(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/next", async (req, res) => {
  await next(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/previous", async (req, res) => {
  await previous(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/change-song", async (req, res) => {
  await changeSong(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/add-song", async (req, res) => {
  await addSong(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/seek", async (req, res) => {
  await seek(req, res);
  emitMusicChange(req.body.roomId);
});
app.post("/api/get-music-data", async (req, res) => {
  await getMusicData(req, res);
  emitMusicChange(req.body.roomId);
});

app.put("/api/lock", async (req, res) => {
  const { roomId, seatIndex } = req.body;
  try {
    if (seatIndex < 0 || seatIndex > 7) { return res.status(400).send("please provide valid seat index") }
    let targetRoom = await Room.findOne({ id: roomId });
    targetRoom.seatsLockingStatus[seatIndex] =
      !targetRoom.seatsLockingStatus[seatIndex];
    await targetRoom.save()
    res.send(targetRoom);
  } catch (e) {
    res.status(500).send(`internal server error ${e}`);
  }
});

let privateKey, certificate;

privateKey = fs.readFileSync("ssl/server-key.pem", "utf8");
certificate = fs.readFileSync("ssl/server-cert.pem", "utf8");
const credentials = { key: privateKey, cert: certificate };
// const server = https.createServer(credentials, app);

const server = http.createServer(app);

const io = require("socket.io")(server);
//io.set('log level', 2);

server.listen(port, null, function () {
  console.log("Listening on port " + port);
});
//app.use(express.bodyParser());

app.get("/", function (req, res) {
  res.sendFile(__dirname + "/client.html");
});

var channels = {};
var sockets = {};
var invitedUsers = {}; // {channel: [user1, user2, ...]}
var UserGifts = {};
var socketUserIds = {};
var joinedAt = {};
/**
 * Users will connect to the signaling server, after which they'll issue a "join"
 * to join a particular channel. The signaling server keeps track of all sockets
 * who are in a channel, and on join will send out 'addPeer' events to each pair
 * of users in a channel. When clients receive the 'addPeer' even they'll begin
 * setting up an RTCPeerConnection with one another. During this process they'll
 * need to relay ICECandidate information to one another, as well as SessionDescription
 * information. After all of that happens, they'll finally be able to complete
 * the peer connection and will be streaming audio/video between eachother.
 */
io.sockets.on("connection", function (socket) {
  // // console.log("Connection event called");
  socket.channels = {};
  sockets[socket.id] = socket;

  // // console.log("[" + socket.id + "] connection accepted");

  // socket.on("connected", (userId) => {
  //   socketUserIds[socket.id] = userId;
  // });

  socket.on("disconnect", async function () {
    // // console.log("Disconnect event called");
    console.log("socketUserIds list", socketUserIds);

    let userId = socketUserIds[socket.id];
    console.log(
      "userId in sisconnect object",
      userId,
      "joinedAt[userId]",
      joinedAt[userId]
    );
    let activeTime = new Date() - joinedAt[userId];
    console.log("activeTime", activeTime);
    const valy = await User.updateOne({ userId }, { $inc: { activeTime } });
    const currUserData = await User.findOne({ userId });
    if (
      currUserData.todayActiveTime + activeTime >= 3600000 &&
      !currUserData.isTodayTimeComplete
    ) {
      await User.updateOne(
        { userId },
        {
          $inc: { activeDays: 1, todayActiveTime: activeTime },
          $set: { isTodayTimeComplete: true },
        }
      );
    } else {
      await User.updateOne(
        { userId },
        {
          $inc: { todayActiveTime: activeTime },
        }
      );
    }
    let curr = new Date();
    let currDate = curr.getDate() + 1;
    let currMonth = curr.getMonth() + 1;
    let currYear = curr.getFullYear();
    let dateString = `${currDate}-${currMonth}-${currYear}`;
    console.log(
      "currUserData.dailyActiveTime.dateString",
      currUserData.dailyActiveTime[dateString],
      currUserData
    );
    if (currUserData.dailyActiveTime[dateString]) {
      await User.updateOne(
        { userId },
        { $inc: { [`dailyActiveTime.${dateString}`]: activeTime } }
      );
    } else {
      await User.updateOne(
        { userId },
        { $set: { [`dailyActiveTime.${dateString}`]: activeTime } }
      );
    }
    console.log("valy", valy);
    for (var channel in socket.channels) {
      part(channel);
    }
    // // console.log("[" + socket.id + "] disconnected");
    let userRoom = socket.channels
      ? Object.keys(socket.channels)[0]
      : Object.keys(socket.channels)[0];
    if (userRoom && UserGifts[userRoom])
      UserGifts[userRoom][socketUserIds[socket.id]] = 0;
    for (id in channels[userRoom]) {
      channels[userRoom][id].emit("giftsUpdated", UserGifts[userRoom]);
    }
    delete sockets[socket.id];
  });

  socket.on("join", function (config) {
    // // console.log("Join event called");
    // // console.log("[" + socket.id + "] join ", config);

    var channel = config.channel;
    var userdata = config.userdata;
    socket.userdata = userdata;
    socketUserIds[socket.id] = userdata.id;
    console.log("socketUserIds list", socketUserIds);
    joinedAt[userdata.id] = new Date();
    console.log;
    console.log("userdata", userdata);
    console.log("joinedAt list", joinedAt);
    if (channel in socket.channels) {
      // // console.log("[" + socket.id + "] ERROR: already joined ", channel);
      return;
    }

    if (!(channel in channels)) {
      // // console.log(`Creating a new room with id: ${channel}`);
      // Room.findOne({ id: channel }).then((roomData) => {
      //     if (!roomData) {
      //         // // console.log("Room not found");
      //         return;
      //     } else {
      //         // // console.log(`updating ${roomData}`);
      //     }
      //     roomData.updateOne({ createdAt: new Date() });
      // });
      channels[channel] = {};
      if (!(channel in giftTimerDetails)) {
        giftTimerDetails[channel] = { isRunning: false };
      }
      // // console.log("Creating 8 seats.");
      invitedUsers[channel] = Array(8).fill(null);
    }

    for (id in channels[channel]) {
      // console.log(
      //   "New User [" +
      //   socket.id +
      //   "] Informing Old User [" +
      //   id +
      //   "] to addPeer"
      // );
      channels[channel][id].emit("addPeer", {
        peer_id: socket.id,
        should_create_offer: false,
        userdata: socket.userdata,
      });
      // console.log(
      //   "New User [" +
      //   socket.id +
      //   "] Being Informed about Old User [" +
      //   id +
      //   "] to addPeer"
      // );
      socket.emit("addPeer", {
        peer_id: id,
        should_create_offer: true,
        userdata: channels[channel][id].userdata,
      });
    }

    channels[channel][socket.id] = socket;
    socket.channels[channel] = channel;
    if (giftTimerDetails[channel].isRunning) {
      emitTimerStartToSocket(socket.id, channel);
    }
  });
  socket.on("lockSeat", async function (config) {
    const { roomId, seatIndex } = config;
    try {
      if (seatIndex < 0 || seatIndex > 7) {
        console.error(`Invalid seatIndex: ${seatIndex}`);
        return;
      }
      let targetRoom = await Room.findOne({ id: roomId });
      targetRoom.seatsLockingStatus[seatIndex] =
        !targetRoom.seatsLockingStatus[seatIndex];
      await targetRoom.save();
      for (id in channels[roomId]) {
        channels[roomId][id].emit("seatsChanged", {
          seats: invitedUsers[roomId],
        });
      }
    } catch (e) {
      console.error(`internal server error ${e}`);
    }
  });

  socket.on("inviteUser", function (config) {
    var channel = config.channel;
    var userId = config.userId;
    var seat = config.seat;
    if (!(channel in channels)) {
      return;
    }
    if (invitedUsers[channel].indexOf(userId) !== -1) {
      invitedUsers[channel][invitedUsers[channel].indexOf(userId)] = null;
    }
    invitedUsers[channel][seat] = userId;
    for (id in channels[channel]) {
      channels[channel][id].emit("seatsChanged", {
        seats: invitedUsers[channel],
      });
    }
  });

  socket.on("removeUser", function (config) {
    var channel = config.channel;
    var userId = config.userId;
    if (!(channel in channels)) {
      console.error(`Channel ${channel} not found.`);
      return;
    }
    if (invitedUsers[channel].indexOf(userId) == -1) {
      console.error(`User ${userId} not found in channel ${channel}`);
      return;
    }
    invitedUsers[channel][invitedUsers[channel].indexOf(userId)] = null;
    for (id in channels[channel]) {
      channels[channel][id].emit("seatsChanged", {
        seats: invitedUsers[channel],
      });
    }
  });

  socket.on("getSeats", function (config) {
    // // console.log("GetSeats event called");
    var channel = config.channel;
    // // // console.log(`[${socket.userdata.id}] getSeats for ${channel}`);

    if (!(channel in channels)) {
      // // console.log(`[${socket.id}] ERROR: not in ${channel}`);
      return;
    }

    socket.emit("seatsChanged", { seats: invitedUsers[channel] });
  });

  socket.on("getUsers", function (config) {
    // console.log("GetUsers event called");
    var channel = config.channel;
    // // console.log(`[${socket.userdata.id}] getUsers for ${channel}`);

    if (!(channel in channels)) {
      // console.log(`[${socket.id}] ERROR: not in ${channel}`);
      return;
    }
    const users = Object.values(channels[channel]).map(
      (socket) => socket.userdata
    );
    // console.log("users:", users);
    socket.emit("receiveUsers", { users: users });
  });

  async function part(channel) {
    // console.log("Part event called");
    // console.log("[" + socket.id + "] part ");

    if (!(channel in socket.channels)) {
      // console.log("[" + socket.id + "] ERROR: not in ", channel);
      return;
    }

    delete socket.channels[channel];
    delete channels[channel][socket.id];
    if (
      invitedUsers[channel] &&
      invitedUsers[channel].includes(socket.userdata.id)
    ) {
      // console.log(`Removing user ${socket.userdata.id} from his seat`);
      invitedUsers[channel][invitedUsers[channel].indexOf(socket.userdata.id)] =
        null;
    } else {
      // console.log(`User ${socket.userdata.id} was not on any seat`);
    }

    for (id in channels[channel]) {
      channels[channel][id].emit("removePeer", { peer_id: socket.id });
      channels[channel][id].emit("seatsChanged", {
        seats: invitedUsers[channel],
      });
      socket.emit("seatsChanged", { seats: invitedUsers[channel] });
      socket.emit("removePeer", { peer_id: id });
    }

    if (Object.keys(channels[channel]).length === 0) {
      // console.log("Deleting room ", channel, " for it is empty");
      delete channels[channel];
      delete invitedUsers[channel];
      await Room.deleteOne({ id: channel });
    }
  }
  socket.on("part", part);

  socket.on("relayICECandidate", function (config) {
    // console.log("RelayIceCandidate event called");
    var peer_id = config.peer_id;
    var ice_candidate = config.ice_candidate;
    // console.log(
    //   "[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ",
    //   ice_candidate
    // );

    if (peer_id in sockets) {
      sockets[peer_id].emit("iceCandidate", {
        peer_id: socket.id,
        ice_candidate: ice_candidate,
      });
    }
  });

  socket.on("message", function (data) {
    // expected input {'channel': roomName, 'message': message}
    ch = data.channel;
    msg = data.message;
    const data2 = data.data;
    // console.log("[" + socket.id + "] broadcasting on channel '", ch);
    // console.log("' a message: ", data.message);
    // console.log("' a data: ", data2);
    for (id in channels[ch]) {
      channels[ch][id].emit("broadcastMsg", {
        peer_id: socket.id,
        message: msg,
        userdata: socket.userdata,
        data: data2,
      });
    }
  });

  socket.on("relaySessionDescription", function (config) {
    // console.log("RelaySessionDescription event called");
    var peer_id = config.peer_id;
    var session_description = config.session_description;
    // console.log(
    //   "[" + socket.id + "] relaying session description to [" + peer_id + "] ",
    //   session_description
    // );

    if (peer_id in sockets) {
      // console.log(`Relaying Session Description to ${peer_id}`);
      sockets[peer_id].emit("sessionDescription", {
        peer_id: socket.id,
        session_description: session_description,
      });
    }
  });

  socket.on("timer", (data) => {
    // console.log("Timer event called:", data);
    const { timerCount, roomId } = data;
    giftTimerDetails[roomId] = {
      isRunning: true,
      startedTime: new Date(),
      duration: timerCount,
    };
    setTimeout(() => {
      stopTimer({ roomId: roomId });
    }, timerCount);
    emitTimerStart(roomId);
  });

  socket.on("sendGift", (data) => {
    const { userId, diamonds, roomId, Quantity } = data;
    // console.log("userId");
    if (giftTimerDetails[roomId].isRunning) {
      if (roomId in UserGifts) {
        if (userId in UserGifts[roomId]) {
          UserGifts[roomId][userId] =
            UserGifts[roomId][userId] + diamonds * Quantity;
        } else {
          UserGifts[roomId][userId] = diamonds * Quantity;
        }
      } else {
        UserGifts[roomId] = {};
        UserGifts[roomId][userId] = diamonds * Quantity;
      }

      for (id in channels[roomId]) {
        emitTimerStartToSocket(id, roomId);
      }
    }
  });

  socket.on("getGifts", (data) => {
    const { roomId } = data;
    emitTimerStartToSocket(socket.id, roomId);
  });

  // socket.on("music-stream", (data) => {
  //   const { channel, audio } = data;
  //   for (id in channels[channel]) {
  //     channels[channel][id].emit("music-started", audio);
  //   }
  // });

  // socket.on("left-room", (data) => {
  //   const { roomId, userId } = data;
  //   UserGifts[roomId][userId] = 0;
  //   for (id in channels[roomId]) {
  //     channels[roomId][id].emit("giftsUpdated", UserGifts[roomId]);
  //   }
  // });

  socket.on("stop-timer", (data) => {
    stopTimer(data);
  });
});

//
// socket.on("disconnect", () => {
//   let userRoom;
//   for (room in channels) {
//     if (socket.id in room) {
//       userRoom = room;
//     }
//   }
//   UserGifts[]
//   for (id in channels[userRoom]) {
//     channels[userRoom][id].emit("giftsUpdated", UserGifts);
//   }
// });

function stopTimer(data) {
  // console.log("Timer completed.");
  const { roomId } = data;
  if (giftTimerDetails[roomId] && giftTimerDetails[roomId] == false) {
    return;
  }
  giftTimerDetails[roomId] = { isRunning: false };
  for (x in UserGifts[roomId]) {
    UserGifts[roomId][x] = 0;
  }
  for (id in channels[roomId]) {
    channels[roomId][id].emit("giftsUpdated", UserGifts[roomId]);
    channels[roomId][id].emit("timerStoped");
  }
}

function emitTimerStart(roomId) {
  for (id in channels[roomId]) {
    emitTimerStartToSocket(id, roomId);
  }
}

function emitTimerStartToSocket(id, roomId) {
  channels[roomId][id].emit("timer-started", {
    startTime: giftTimerDetails[roomId].startedTime,
    duration: giftTimerDetails[roomId].duration,
  });
  channels[roomId][id].emit("giftsUpdated", UserGifts[roomId]);
}
