const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require('path');
var http = require("http");
const { exec } = require("child_process");
// const https = require("https");
const { channel } = require("diagnostics_channel");
var giftTimerDetails = {};

const app = express();
// app.use(express.static('public'));
app.use('/static', express.static(path.join(__dirname, 'public')));
const port = 8080;

app.use(bodyParser.json());

const { Room } = require("./models/room");
const { generateUniqueRoomId } = require("./utils");

// Get rooms
app.get("/api/rooms", async (req, res) => {
  console.log("get Request on '/api/rooms'");
  const { id, userId } = req.query;
  try {
    let roomData;
    if (id) {
      roomData = await Room.findById(id);
    } else if (userId) {
      roomData = await Room.findOne({ admin: userId });
    }
    if (!roomData) {
      return res.status(404).json({ error: "Room not found" });
    }
    res.status(200).json(roomData);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new room
app.post("/api/rooms", async (req, res) => {
  console.log("post Request on ('/api/rooms')");
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
  console.log("post Request on '/api/update-room',");
  const { admin } = req.body;
  try {
    const existingRoom = await Room.findOne({ admin: admin });
    if (!existingRoom) {
      console.log("Room not found with admin:", admin);
      return res.status(404).json({ error: "Room not found" });
    }
    await existingRoom.updateOne(req.body);
    res.json(existingRoom);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/rooms/all", async (req, res) => {
  console.log("get Request on '/api/rooms/all");
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
    const detailedRooms = await Promise.all(
      paginatedRooms.map(async (room) => {
        const roomData = await Room.findOne({ id: room.channelId });
        return roomData;
      })
    );
    console.log("paginatedRooms", detailedRooms);
    res.status(200).json(detailedRooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/update-server", async (req, res) => {
  console.log("Updating Server: ");
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
      console.log(`Git Pull Successful: ${stdout}`);
      res.status(200).send("Server Updated Successfully");
    });
  } else {
    res.status(200).send("Ignoring non-master branch push event");
  }
});

// const server = http.createServer(app)

// let privateKey, certificate;

// privateKey = fs.readFileSync("ssl/server-key.pem", "utf8");
// certificate = fs.readFileSync("ssl/server-cert.pem", "utf8");
// const credentials = { key: privateKey, cert: certificate };
// const server = https.createServer(credentials, app);
const server = http.createServer(app);

// Music Streaming
// const musicFile = path.join(__dirname, 'music.mp3'); // Replace with your music file path

// server.on('request', (req, res) => {
//   console.log("Streaming Music...");
//   const stream = fs.createReadStream(musicFile);
//   stream.pipe(res);
// });

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
  console.log("Connection event called");
  socket.channels = {};
  sockets[socket.id] = socket;

  console.log("[" + socket.id + "] connection accepted");

  socket.on("disconnect", function () {
    console.log("Disconnect event called");
    for (var channel in socket.channels) {
      part(channel);
    }
    console.log("[" + socket.id + "] disconnected");
    delete sockets[socket.id];
  });

  socket.on("join", function (config) {
    console.log("Join event called");
    console.log("[" + socket.id + "] join ", config);
    var channel = config.channel;
    var userdata = config.userdata;
    socket.userdata = userdata;

    if (channel in socket.channels) {
      console.log("[" + socket.id + "] ERROR: already joined ", channel);
      return;
    }

    if (!(channel in channels)) {
      console.log(`Creating a new room with id: ${channel}`);
      // Room.findOne({ id: channel }).then((roomData) => {
      //     if (!roomData) {
      //         console.log("Room not found");
      //         return;
      //     } else {
      //         console.log(`updating ${roomData}`);
      //     }
      //     roomData.updateOne({ createdAt: new Date() });
      // });
      channels[channel] = {};
      if (!(channel in giftTimerDetails)) {
        giftTimerDetails[channel] = { isRunning: false };
      }
      console.log("Creating 8 seats.");
      invitedUsers[channel] = Array(8).fill(null);
    }

    for (id in channels[channel]) {
      console.log(
        "New User [" +
        socket.id +
        "] Informing Old User [" +
        id +
        "] to addPeer"
      );
      channels[channel][id].emit("addPeer", {
        peer_id: socket.id,
        should_create_offer: false,
        userdata: socket.userdata,
      });
      console.log(
        "New User [" +
        socket.id +
        "] Being Informed about Old User [" +
        id +
        "] to addPeer"
      );
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

  socket.on("inviteUser", function (config) {
    console.log("Invite event called");
    var channel = config.channel;
    var userId = config.userId;
    var seat = config.seat;
    // console.log(`[${socket.userdata.id}] invite ${userId} to join ${channel} on seat ${seat}`);

    if (!(channel in channels)) {
      console.log(`[${socket.id}] ERROR: not in ${channel}`);
      return;
    }

    if (invitedUsers[channel][seat]) {
      console.log(
        `[${socket.id}] seat ${seat} is already occupied, replacing user ${invitedUsers[channel][seat]} with ${userId}`
      );
    }

    if (invitedUsers[channel].indexOf(userId) !== -1) {
      console.log(
        `[${socket.id}] user is already on seat ${invitedUsers[channel].indexOf(
          userId
        )}. Moving hime to new seat ${seat}`
      );
      invitedUsers[channel][invitedUsers[channel].indexOf(userId)] = null;
    }

    invitedUsers[channel][seat] = userId;

    for (id in channels[channel]) {
      channels[channel][id].emit("seatsChanged", {
        seats: invitedUsers[channel],
      });
    }
  });

  socket.on("getSeats", function (config) {
    console.log("GetSeats event called");
    var channel = config.channel;
    // console.log(`[${socket.userdata.id}] getSeats for ${channel}`);

    if (!(channel in channels)) {
      console.log(`[${socket.id}] ERROR: not in ${channel}`);
      return;
    }

    socket.emit("seatsChanged", { seats: invitedUsers[channel] });
  });

  socket.on("getUsers", function (config) {
    console.log("GetUsers event called");
    var channel = config.channel;
    // console.log(`[${socket.userdata.id}] getUsers for ${channel}`);

    if (!(channel in channels)) {
      console.log(`[${socket.id}] ERROR: not in ${channel}`);
      return;
    }
    const users = Object.values(channels[channel]).map(
      (socket) => socket.userdata
    );
    console.log("users:", users);
    socket.emit("receiveUsers", { users: users });
  });

  function part(channel) {
    console.log("Part event called");
    console.log("[" + socket.id + "] part ");

    if (!(channel in socket.channels)) {
      console.log("[" + socket.id + "] ERROR: not in ", channel);
      return;
    }

    delete socket.channels[channel];
    delete channels[channel][socket.id];
    if (
      invitedUsers[channel] &&
      invitedUsers[channel].includes(socket.userdata.id)
    ) {
      console.log(`Removing user ${socket.userdata.id} from his seat`);
      invitedUsers[channel][invitedUsers[channel].indexOf(socket.userdata.id)] =
        null;
    } else {
      console.log(`User ${socket.userdata.id} was not on any seat`);
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
      console.log("Deleting room ", channel, " for it is empty");
      delete channels[channel];
      delete invitedUsers[channel];
    }
  }
  socket.on("part", part);

  socket.on("relayICECandidate", function (config) {
    console.log("RelayIceCandidate event called");
    var peer_id = config.peer_id;
    var ice_candidate = config.ice_candidate;
    console.log(
      "[" + socket.id + "] relaying ICE candidate to [" + peer_id + "] ",
      ice_candidate
    );

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
    console.log("[" + socket.id + "] broadcasting on channel '", ch);
    if (data["message"]) console.log("' a message: ", data.message);
    if (data2) console.log("' a data: ", data2);
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
    console.log("RelaySessionDescription event called");
    var peer_id = config.peer_id;
    var session_description = config.session_description;
    console.log(
      "[" + socket.id + "] relaying session description to [" + peer_id + "] ",
      session_description
    );

    if (peer_id in sockets) {
      console.log(`Relaying Session Description to ${peer_id}`);
      sockets[peer_id].emit("sessionDescription", {
        peer_id: socket.id,
        session_description: session_description,
      });
    }
  });

  socket.on("timer", (data) => {
    console.log("Timer event called:", data);
    const { timerCount, roomId } = data;
    giftTimerDetails[roomId] = { isRunning: true, startedTime: new Date(), duration: timerCount };
    setTimeout(() => {
      console.log("Timer completed.");
      giftTimerDetails[roomId] = { isRunning: false };
      emitTimerStart(roomId);
    }, timerCount);
    emitTimerStart(roomId);
  });

  socket.on("sendGift", (data) => {
    const { userId, diamonds, roomId } = data;
    if (giftTimerDetails[roomId].isRunning) {
      if (userId in UserGifts) {
        UserGifts[userId] = UserGifts[userId] + diamonds;
      } else {
        UserGifts[userId] = diamonds;
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

  socket.on("music-stream", (data) => {
    const { channel, audio } = data;
    for (id in channels[channel]) {
      channels[channel][id].emit("music-started", audio);
    }
  })
});

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
  channels[roomId][id].emit("giftsUpdated",
    UserGifts
  );
}