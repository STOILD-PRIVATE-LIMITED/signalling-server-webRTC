const { getAudioDurationInSeconds } = require('get-audio-duration')
const { MusicData } = require('../../models/music_data');
const fs = require("fs");
const { createCipheriv } = require('crypto');
const path = require("path");

async function getSongDuration(fileName, roomId) {
    console.log("getSongDuration function called.");
    let parts = __dirname.split(path.sep);
    dir = parts.slice(0, parts.length - 2).join("/");
    console.log("dir name =", dir);
    fileName = dir + "/public/" + roomId + "/" + fileName;
    console.log("Absolute fileName =", fileName)
    try {
        return (await getAudioDurationInSeconds(fileName)) * 1000
    } catch (e) {
        console.error(e);
        throw e;
    }
}

async function getMusicData(req, res) {
    console.log("getMusicData function called.");
    const roomId = req.body.roomId;
    console.log("roomId =", roomId);
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
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

async function setNextCallback(timeout, roomId, index) {
    setTimeout(async () => {
        let musicData = await findMusicData(roomId);
        if (index != musicData.index) return;
        await nextSong(roomId);
    }, timeout);
}

async function play(req, res) {
    console.log("play function called.");
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
        musicData.index += 1;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId, error: e });
    }
}

async function pause(req, res) {
    console.log("pause function called.");
    const roomId = req.body.roomId;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        musicData.isPlaying = false;
        musicData.pauseDuration = Date.now() - musicData.startTime;
        musicData.startTime = 0;
        musicData.index += 1;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
        musicData.save();
        res.status(200).send(musicData);
    } catch (e) {
        res.status(500).send({ message: "Cannot find music data for room:" + roomId });
    }
}

async function next(req, res) {
    console.log("next function called.");
    const roomId = req.body.roomId;
    try {
        console.log("next song function is going to be called.");
        const musicData = await nextSong(req.body.roomId);
        console.log("setNextCallback is going to be called.");
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
        console.log("All Good!");
        res.send(musicData);
    } catch (e) {
        console.error(e);
        res.status(400).json({
            error: e
        });
    }

}

async function nextSong(roomId) {
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
    await musicData.save();
    return musicData;
}

async function previous(req, res) {
    console.log("previous function called.");
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
        musicData.index += 1;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
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
        musicData = await findMusicData(roomId);
        if (musicData.playlist.indexOf(song) == -1) {
            res.status(400).send("song not in playlist");
            return;
        }
        musicData.currentSong = song;
        musicData.startTime = Date.now();
        musicData.isPlaying = true;
        musicData.index += 1;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
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
    console.log("seek function called.");
    const roomId = req.body.roomId;
    const duration = req.body.duration;
    let musicData = null;
    try {
        musicData = await findMusicData(roomId);
        musicData.startTime = Date.now() - duration;
        musicData.index += 1;
        setNextCallback(await getSongDuration(musicData.currentSong, roomId) - (Date.now() - musicData.startTime), roomId, musicData.index);
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
    findMusicData,
};