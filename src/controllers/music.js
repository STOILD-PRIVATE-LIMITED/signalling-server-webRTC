const { getAudioDurationInSeconds } = require('get-audio-duration')
const { MusicData } = require('../../models/music_data');
const fs = require("fs");
const { createCipheriv } = require('crypto');
const path = require("path");

async function getSongDuration(fileName, roomId) {
    let parts = __dirname.split(path.sep);
    dir = parts.slice(0, parts.length - 2).join("/");
    fileName = dir + "/public/" + roomId + "/" + fileName;
    try {
        const duration = (await getAudioDurationInSeconds(fileName)) * 1000;
        console.log(`getSongDuration(${fileName}) = `, duration);
        return duration;
    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function getMusicData(req, res) {
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        if (musicData == null || !musicData) {
            const playlist = await getPlaylist(roomId);
            musicData = await MusicData.findOneAndUpdate({
                roomId: roomId,
            }, {
                roomId: roomId,
                currentSong: playlist.length > 0 ? playlist[0] : null,
                isPlaying: false,
                startTime: Date.now(),
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

async function findMusicData(roomId) {
    let musicData = await MusicData.findOne({ roomId: roomId });
    return musicData;
}

timeoutIndex = null;
async function setNextCallback(timeout, roomId) {
    if (timeoutIndex != null) {
        console.log("Clearing previous timeout.");
        clearTimeout(timeoutIndex);
    }
    console.log("setNextCallback function set with roomId =", roomId, "and timeout =", timeout, "ms.");
    timeoutIndex = setTimeout(async () => {
        console.log("Playing next song.");
        await nextSong(roomId);
    }, timeout);
}

async function play(req, res) {
    console.log("Play route");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        if (!musicData.currentSong || musicData.playlist.indexOf(musicData.currentSong) == -1) {
            if (musicData.playlist.length == 0) {
                res.status(400).send("playlist is empty");
                return;
            }
            musicData.currentSong = musicData.playlist[0];
            if (musicData.startTime == 0) {
                musicData.startTime = Date.now();
            }
        }
        if (musicData.pauseDuration != 0) {
            musicData.startTime = Date.now() - musicData.pauseDuration;
            musicData.pauseDuration = 0;
        }
        musicData.isPlaying = true;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId, error: e });
    }
}

async function pause(req, res) {
    console.log("pause route");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        musicData.isPlaying = false;
        musicData.pauseDuration = Date.now() - musicData.startTime;
        musicData.startTime = 0;
        try {
            clearTimeout(timeoutIndex);
        } catch (e) {
            console.error("Error Clearing Previous Timeout", e);
        }
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function next(req, res) {
    console.log("next route");
    const roomId = req.body.roomId;
    try {
        const musicData = await nextSong(req.body.roomId);
        res.send(musicData);
    } catch (e) {
        console.error(e);
        res.status(400).json({
            error: e
        });
    }

}

async function nextSong(roomId) {
    console.log("Moving onto Next Song");
    let musicData = null;
    musicData = await findMusicData(roomId);
    if (musicData.playlist.length == 0) {
        throw "playlist is empty";
    }
    if (musicData.shuffle) {
        musicData.currentSong = musicData.playlist[Math.floor(Math.random() * musicData.playlist.length)];
    } else {
        const currentIndex = musicData.playlist.indexOf(musicData.currentSong);
        musicData.currentSong = musicData.playlist[(currentIndex + 1) % musicData.playlist.length];
    }
    musicData.startTime = Date.now();
    musicData.isPlaying = true;
    setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId);
    await musicData.save();
    return musicData;
}

async function previous(req, res) {
    console.log("previous route");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
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
        musicData.startTime = Date.now();
        musicData.isPlaying = true;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId);
        musicData.save();
        res.status(200).send(musicData);
    }
    catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function changeSong(req, res) {
    console.log("changeSong route");
    const roomId = req.body.roomId;
    const song = req.body.song;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        if (musicData.playlist.indexOf(song) == -1) {
            res.status(400).send("song not in playlist");
            return;
        }
        musicData.currentSong = song;
        musicData.startTime = Date.now();
        musicData.isPlaying = true;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function addSong(req, res) {
    console.log("addSong route");
    const roomId = req.body.roomId;
    const song = req.body.song;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
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
    console.log("seek route");
    const roomId = req.body.roomId;
    const duration = req.body.duration;
    console.log("seeking duration =", duration);
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        musicData.startTime = Date.now() - duration;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function getPlaylist(roomId) {
    console.log("getPlaylist route");
    const folder = "./public/" + roomId;
    if (!(fs.existsSync(folder))) {
        fs.mkdirSync(folder);
        // console.log(`Folder '${folder}' Created Successfully.`);
    }
    const files = await fs.readdirSync(folder);
    // console.log(`Files in folder ${roomId} are ${files}`);
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
    findMusicData,
};