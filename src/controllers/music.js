const { getAudioDurationInSeconds } = require('get-audio-duration')
const { MusicData } = require('../../models/music_data');
const fs = require("fs");
const { createCipheriv } = require('crypto');

async function getSongDuration(filePath) {
    console.log("getSongDuration function called.");
    return (await getAudioDurationInSeconds(filePath)) * 1000
}

async function getMusicData(req, res) {
    console.log("getMusicData function called.");
    const roomId = req.body.roomId;
    console.log("roomId =", roomId);
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        console.log("musicData =", musicData);
        if (musicData == null || !musicData) {
            console.log("Creating new music data.");
            const playlist = await getPlaylist(roomId);
            musicData = await MusicData.findOneAndUpdate({
                roomId: roomId,
            }, {
                roomId: roomId,
                currentSong: playlist.length > 0 ? playlist[0] : null,
                isPlaying: false,
                duration: 0,
                playlist: playlist,
                shuffle: false,
                repeat: false
            }, { upsert: true, new: true });
        }
        musicData.playlist = await getPlaylist(roomId);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId, error: e });
    }
}

async function play(req, res) {
    console.log("play function called.");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        if (!musicData.currentSong || musicData.playlist.indexOf(musicData.currentSong) == -1) {
            if (musicData.playlist.length == 0) {
                res.status(400).send("playlist is empty");
                return;
            }
            musicData.currentSong = musicData.playlist[0];
            musicData.duration = 0;
        }
        musicData.isPlaying = true;
        musicData.save();
        // TODO: setTimeOut to call next song after song ends
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId, error: e });
    }
}

async function pause(req, res) {
    console.log("pause function called.");
    const roomId = req.body.roomId;
    const duration = req.body.duration;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        musicData.isPlaying = false;
        musicData.duration = duration;
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function next(req, res) {
    console.log("next function called.");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        if (musicData.playlist.length == 0) {
            res.status(400).send("playlist is empty");
            return;
        }
        if (musicData.shuffle) {
            musicData.currentSong = musicData.playlist[Math.floor(Math.random() * musicData.playlist.length)];
        } else {
            const currentIndex = musicData.playlist.indexOf(musicData.currentSong);
            musicData.currentSong = musicData.playlist[(currentIndex + 1) % musicData.playlist.length];
        }
        musicData.duration = 0;
        musicData.isPlaying = true;
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function previous(req, res) {
    console.log("previous function called.");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        if (musicData.playlist.length == 0) {
            res.status(400).send("playlist is empty");
            return;
        }
        if (musicData.shuffle) {
            musicData.currentSong = musicData.playlist[Math.floor(Math.random() * musicData.playlist.length)];
        } else {
            const currentIndex = musicData.playlist.indexOf(musicData.currentSong);
            musicData.currentSong = musicData.playlist[(currentIndex - 1 + musicData.playlist.length) % musicData.playlist.length];
        }
        musicData.duration = 0;
        musicData.isPlaying = true;
        musicData.save();
        res.status(200).send(musicData);
    }
    catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function changeSong(req, res) {
    console.log("changeSong function called.");
    const roomId = req.body.roomId;
    const song = req.body.song;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        if (musicData.playlist.indexOf(song) == -1) {
            res.status(400).send("song not in playlist");
            return;
        }
        musicData.currentSong = song;
        musicData.duration = 0;
        musicData.isPlaying = true;
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function addSong(req, res) {
    console.log("addSong function called.");
    const roomId = req.body.roomId;
    const song = req.body.song;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        if (musicData.playlist.indexOf(song) != -1) {
            musicData.playlist.push(song);
        }
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function seek(req, res) {
    console.log("seek function called.");
    const roomId = req.body.roomId;
    const duration = req.body.duration;
    let musicData = null;
    try {
        musicData = await MusicData.findOne({ roomId: roomId });
        musicData.duration = duration;
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function getPlaylist(roomId) {
    const folder = "./public/" + roomId;
    if (!(fs.existsSync(folder))) {
        fs.mkdirSync(folder);
        console.log(`Folder '${folder}' Created Successfully.`);
    }
    const files = await fs.readdirSync(folder);
    console.log(`Files in folder ${roomId} are ${files}`);
    return files;
}

module.exports = {
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
};