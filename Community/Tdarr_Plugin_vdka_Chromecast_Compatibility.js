function details() {
    return {
        id: "Tdarr_Plugin_vdka_Chromecast_Compatibility",
        Stage: "Pre-processing",
        Name: "Chromecast Compatibility Plugin",
        Type: "Video",
        Operation: "Transcode",
        Description: 
                    `[Contains built-in filter] This plugin is specifically made to make files that are chromecast direct streaming compatible. 
                     The plugin will make sure video is h264, has no subs, has no image streams, has compatible audio, is an mp4 file, and removes any unnecesary metadata.
                     CRF value for quality when transocding to h264 is configurable, defaults to 23 if not set.
                     Maximum bitrate is configurable, for situations where the server has constrained upload, this should NOT be used otherwise.
                     FFmpeg preset is configurable, uses slow by default.
                     FFmpeg currently does not support 7.1 EAC3 encoding, any non-EAC3 7.1 tracks will be downmixed to 5.1 AC3\n\n`,
        Version: "1.00",
        Link: "https://github.com/HaveAGitGat/Tdarr_Plugins/blob/master/Community/Tdarr_Plugin_vdka_Chromecast_Compatibility.js",
        Tags: "pre-processing,ffmpeg,h264,configurable",
        Inputs: [{
                name: "crf",
                tooltip: `Enter the crf value you want, leave blank for default. 
              \\n CRF is a quality setting, higher numbers means lower quality. Range is 0-51, sane values are 18-28, default is 23.
              \\n This only applies if video is transcoded, video already in h264 will not be transcoded with this setting

              \\nExample:\\n  
                23`,
            },
            {
                name: "max_bitrate",
                tooltip: `Enter the maximum bitrate you want, leave blank for none. 
              \\n This is for people with constrained upload speeds, not reccomended to set if you have decent upload speeds.
              \\n This only applies if video is transcoded, video already in h264 will not be transcoded with this setting
      
              \\nExample:\\n
                4000`,
            },
            {
                name: "ffmpeg_preset",
                tooltip: `Enter the ffmpeg preset you want, leave blank for default (slow) 
              \\n This only applies if video is transcoded, video already in h264 will not be transcoded with this setting
      
              \\nExample:\\n 
                slow  
      
              \\nExample:\\n 
                medium  
      
              \\nExample:\\n 
                fast  
      
              \\nExample:\\n 
                veryfast`,
            },
        ],
    };
}

module.exports.plugin = function plugin(file, librarySettings, inputs) {
    var transcode = 0; //if this var changes to 1 the file will be transcoded
    var subcli = `-c:s copy`;
    var maxmux = "";
    var removeimages = "";
    var crf = "";
    var audioandsubcommandinsert = "";
    var videocopy = false
    var audiocopy = false
    var nosubs = false
    var videoIdx = 0;
    var audioIdx = 0;
    var subtitleIdx = 0;
    //default values that will be returned
    var response = {
        processFile: false,
        preset: "",
        container: "mp4",
        handBrakeMode: false,
        FFmpegMode: true,
        reQueueAfter: true,
        infoLog: "",
        maxmux: false,
    };


    //
    //CHECKS PART
    //


    // Check if file is a video. If it isn't then exit plugin.
    if (file.fileMedium !== "video") {
        response.processFile = false;
        response.infoLog += "☒File is not a video. \n";
        return response;
    }

    // Check if crf is configured, default to 23 if not
    var crf
    if (inputs.crf === undefined) {
        crf = `23`;
    } else {
        crf = `${inputs.crf}`;
    }

    // Check if preset is configured, default to slow if not
    var ffmpeg_preset
    if (inputs.ffmpeg_preset === undefined) {
        ffmpeg_preset = `slow`;
    } else {
        ffmpeg_preset = `${inputs.ffmpeg_preset}`;
    }

    // Check if max_bitrate is configured correctly, if not, do not limit bitrate
    var max_bitrate = "";
    if (!isNaN(Number(inputs.max_bitrate))) {
        max_bitrate += `-maxrate ${inputs.max_bitrate}`;
    } else {
        response.infoLog += `No maximum bitrate set, bitrate will not be limited.\n`;
    }



//
// VIDEO PART
//


    // Go through each stream for video streams in the file.
    for (var i = 0; i < file.ffProbeData.streams.length; i++) {
        var streamX = file.ffProbeData.streams[i];
        // Check if stream is a video.
        if (streamX.codec_type.toLowerCase() == "video") {
            // Check if codec  of stream is mjpeg/png, if so then remove this "video" stream. mjpeg/png are usually embedded pictures that can cause havoc with plugins.
            if (streamX.codec_name == "mjpeg" || streamX.codec_name == "png") {
                removeimages += `-map -v:${videoIdx} `;
            }

            // Check if codec of stream is h264 AND check if it is mp4. If so just copy this video part
            if (streamX.codec_name == "h264" && file.container == "mp4") {
                response.infoLog += `☑Video already h264 and .mp4. Video stream will not be transcoded. \n`;
                response.preset = `,-map 0 -c:v:${videoIdx} copy `;
                response.processFile = true;
                videocopy = true;
            }

            // Check if codec of stream is 264 AND check if it is mp4. If so remux file.
            if (streamX.codec_name == "h264" && file.container != "mp4") {
                response.infoLog += `☒Video is h264 but is not .mp4 container. Video stream will not be transcoded but file will be remuxed. \n`;
                response.preset = `,-map 0 -c:v:${videoIdx} copy `;
                response.processFile = true;
            }

            // Check if codec of stream is 264, if not, transcode!
            if (streamX.codec_name != "h264") {
                response.infoLog += `☒Video is not h264, will be transcoded. Max bitrate set to ${inputs.max_bitrate}\n`;
                response.preset = `,-map 0 -c:v:${videoIdx} libx264 -preset ${ffmpeg_preset} -crf ${crf} ${max_bitrate} `;
                response.processFile = true;
            // Increment videoIdx.
                videoIdx++;
            }
        }


//
// AUDIO PART
//


        // Go through each stream in the file.
        for (var i = 0; i < file.ffProbeData.streams.length; i++) {
            var streamX = file.ffProbeData.streams[i];
            // Check if stream is audio.
            if (streamX.codec_type.toLowerCase() == "audio") {
                // Check if stream is 8 channel audio that isn't EAC3, convert to EAC3 if not
                if (streamX.channels == "8" && streamX.codec_name != "eac3") {
                    audioandsubcommandinsert += `-c:a:${audioIdx} ac3 `;
                    response.infoLog += `☒Audio track ${audioIdx} is 8 channel, but not EAC3, downmixing to AC3 6ch. \n`;
                    audioIdx++;
                    continue;
                }

                // Check if stream is 6 channel audio that isn't AC3, convert to AC3 if not
                if (streamX.channels == "6" && streamX.codec_name != "ac3") {
                    audioandsubcommandinsert += `-c:a:${audioIdx} ac3 `;
                    response.infoLog += `☒Audio track ${audioIdx} is 6 channel, but not AC3, converting to AC3. \n`;
                    audioIdx++;
                    continue;
                }

                // Check if stream is 2 channel audio that isn't AAC, MP3, or Opus, convert to AAC if not
                if (streamX.channels == "2" && !["aac", "mp3", "opus"].includes(streamX.codec_name)) {
                    audioandsubcommandinsert += `-c:a:${audioIdx} aac `;
                    response.infoLog += `☒Audio track ${audioIdx} is 2 channel, but not AAC, MP3, or Opus, converting to AAC. \n`;
                    audioIdx++;
                    continue;
                }

                // Check if stream is 1 channel audio that isn't AAC, MP3, or Opus, convert to AAC if not
                if (streamX.channels == "1" && !["aac", "mp3", "opus"].includes(streamX.codec_name)) {
                    audioandsubcommandinsert += `-c:a:${audioIdx} aac `;
                    response.infoLog += `☒Audio track ${audioIdx} is 1 channel, but not AAC, MP3, or Opus, converting to AAC. \n`;
                    audioIdx++;
                    continue;

                // If stream is compatible, set to copy stream
                } else {
                    response.infoLog += `☑Audio track ${audioIdx} is compatible. Will not be transcoded \n`
                    audioandsubcommandinsert += `-c:a:${audioIdx} copy `
                }

                // Increment audioIdx
                audioIdx++;
            }
        }

        // Check if audio needs to be transcoded or not, if all streams are compatible, audiocopy is set to true
        // Go through each stream 
        for (var i = 0; i < file.ffProbeData.streams.length; i++) {
            var streamX = file.ffProbeData.streams[i];

            // Check if stream is audio, if not slap a continue; on it
            if (streamX.codec_type.toLowerCase() != "audio")
                      continue;

            // Check if stream is in compatible codec, if it isn't, then set audiocopy to false, and break the loop
            if (!["aac", "mp3", "opus", "ac3", "eac3"].includes(streamX.codec_name)) {
                      audiocopy = false;
                      break;
                }

            // Check if stream is a compatible audio format, set audiocopy = true if it is
            if (["aac", "mp3", "opus", "ac3", "eac3"].includes(streamX.codec_name))
                      audiocopy = true;
                }


//
//SUBTITLES PART
//

        //Check for subs and remove if found
        var hasSubs = false;

        for (var i = 0; i < file.ffProbeData.streams.length; i++) {
            try {
                if (
                    file.ffProbeData.streams[i].codec_type.toLowerCase() == "subtitle"
                ) {
                    hasSubs = true;
                }
            } catch (err) {}
        }

        if (hasSubs) {
            response.infoLog += "☒File has subs, these will be removed. \n";
            audioandsubcommandinsert += "-sn ";
            response.reQueueAfter = true;
            response.processFile = true;
        } else {
            response.infoLog += "☑File has no subs \n";
            nosubs = true
        }


//
//CHECK IF IT NEEDS PROCESSING 
//


        // Check if all codecs checked out as compatible, if they do, return processFile = false
        response.processFile = !(videocopy && audiocopy && nosubs);
        if (!response.processFile) {
            response.infoLog += "☑File should be fully chromecast compatible. File will not be processed. \n";
            return response;
        }
    }


//
//PROCESS FILE
//


    response.container = "mp4";
    response.preset += `${audioandsubcommandinsert} -map_metadata -1 ${removeimages} -max_muxing_queue_size 9999`;
    response.processFile = true;
    response.infoLog += `File needs work to be chromecast compatible, processing!\n`;
    return response;
}

module.exports.details = details;
