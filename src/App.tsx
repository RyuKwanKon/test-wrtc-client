import React, { useState, useRef, useEffect, useCallback } from "react";
import io from "socket.io-client";
import Video from "./Components/Video";
import { WebRTCUser } from "./types";
import './App.css'

const pc_config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
    {
      urls: "turn:43.203.19.5:3478?transport=udp",
      username: "bootstrap",
      credential: "qlalfqjsgh486",
    },
    {
      urls: "turn:43.203.19.5:3478?transport=udp",
      username: "bootstrap",
      credential: "qlalfqjsgh486",
    },
  ],
};
// const SOCKET_SERVER_URL = "https://api.moldev.site";
// const SOCKET_SERVER_URL = "https://api.moldev.site";
const SOCKET_SERVER_URL = "http://localhost:8080"

const App = () => {
  const socketRef = useRef<SocketIOClient.Socket>();
  const localStreamRef = useRef<MediaStream>();
  const sendPCRef = useRef<RTCPeerConnection>();
  const receivePCsRef = useRef<{ [socketId: string]: RTCPeerConnection }>({});
  const [users, setUsers] = useState<Array<any>>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const closeReceivePC = useCallback((id: string) => {
    if (!receivePCsRef.current[id]) return;
    receivePCsRef.current[id].close();
    delete receivePCsRef.current[id];
  }, []);

  const createReceiverOffer = useCallback(
    async (senderSocketId: string) => {
      try {
        const pc = new RTCPeerConnection(pc_config);

        await pc.createOffer({offerToReceiveAudio: true, offerToReceiveVideo: true}).then((sdp) => {
          pc.setLocalDescription(new RTCSessionDescription(sdp)).then(() => {
            if (!socketRef.current) return;

            socketRef.current.emit("receiverOffer", {
              sdp,
              receiverSocketId: socketRef.current.id,
              senderSocketId: senderSocketId,
              roomId: "1234",
            })
          })
        });

        return pc;
      } catch (error) {
        console.log(error);
        return undefined;
      }
    },[]
  );

  const createReceiverPeerConnection = useCallback((pc: RTCPeerConnection, socketId: string) => {
    try {
      // add pc to peerConnections object
      receivePCsRef.current = { ...receivePCsRef.current, [socketId]: pc };

      pc.onicecandidate = (e) => {
        if (!(e.candidate && socketRef.current)) return;
        socketRef.current.emit("receiverCandidate", {
          candidate: e.candidate,
          receiverSocketId: socketRef.current.id,
          senderSocketId: socketId,
          roomId: "1234",
        });
      };

      pc.oniceconnectionstatechange = (e) => {
        console.log(e);
      };

      pc.ontrack = (e) => {
        setUsers((prev) => 
          prev
          .filter((user) => user.id !== socketId)
          .concat({
            id: socketId,
            stream: e.streams[0]
          })
        );
      };

    } catch (e) {
      console.error(e);
    }
  }, []);

  const createReceivePC = useCallback(
    async (id: string) => {
      try {
        console.log(`socketID(${id}) user entered`);
        const pc = await createReceiverOffer(id);
        if (!(socketRef.current && pc)) return;
        createReceiverPeerConnection(pc, id);
      } catch (error) {
        console.log(error);
      }
    },
    [createReceiverOffer, createReceiverPeerConnection]
  );

  const createSenderOffer = useCallback(async () => {
    try {
      const pc = new RTCPeerConnection(pc_config);
      if (localStreamRef.current) {
        console.log("add local stream");
        localStreamRef.current.getTracks().forEach((track) => {
          if (!localStreamRef.current) return;
          console.log(track, localStreamRef.current)
          pc.addTrack(track, localStreamRef.current);
        });
      } else {
        console.log("no local stream");
      }

      await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      }).then((sdp) => {
        pc.setLocalDescription(new RTCSessionDescription(sdp)).then(async () => {
          if (!socketRef.current) return;
          await socketRef.current.emit("senderOffer", {
            sdp,
            senderSocketId: socketRef.current.id,
            roomId: "1234",
          })
        })
      })

      pc.onicecandidate = (e) => {
        if (!(e.candidate && socketRef.current)) return;
        socketRef.current.emit("senderCandidate", {
          candidate: e.candidate,
          senderSocketId: socketRef.current.id,
          roomId: "1234"
        });
      };
  
      pc.oniceconnectionstatechange = (e) => {
        console.log(e);
      };
      sendPCRef.current = pc;
    } catch (error) {
      console.log(error);
    }
  }, []);

  // const createSenderPeerConnection = useCallback(() => {
  //   if(!sendPCRef.current) return;
  //   sendPCRef.current.onicecandidate = (e) => {
  //     if (!(e.candidate && socketRef.current)) return;
  //     socketRef.current.emit("senderCandidate", {
  //       candidate: e.candidate,
  //       senderSocketId: socketRef.current.id,
  //       roomId: "1234"
  //     });
  //   };

  //   sendPCRef.current.oniceconnectionstatechange = (e) => {
  //     console.log(e);
  //   };
  // }, []);

  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: 240,
          height: 240,
        },
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      if (!socketRef.current) return;

      await createSenderOffer();
      // await createSenderPeerConnection();

      socketRef.current.emit("joinRoom", {
        id: socketRef.current.id,
        roomId: "1234",
      });
    } catch (e) {
      console.log(`getUserMedia error: ${e}`);
    }
  }, [createSenderOffer]);

  useEffect(() => {
    socketRef.current = io.connect(SOCKET_SERVER_URL,
      {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        forceNew: false
      }
    );

    getLocalStream();

    socketRef.current.on("userEnter", (data: { id: string }) => {
      createReceivePC(data.id);
    });

    socketRef.current.on("allUsers", (data: { users: Array<{ id: string }>}) => {
        data.users.forEach((user) => createReceivePC(user.id));
      }
    );

    socketRef.current.on("userExit", (data: { id: string }) => {
        closeReceivePC(data.id);
        setUsers((users) => users.filter((user) => user.id !== data.id));
    });

    socketRef.current.on("getSenderAnswer", async (data: { sdp: RTCSessionDescription }) => {
        try {
          if (!sendPCRef.current) return;
          await sendPCRef.current.setRemoteDescription(
            new RTCSessionDescription(data.sdp)
          );
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on("getSenderCandidate", async (data: { candidate: RTCIceCandidateInit }) => {
        try {
          if (!(data.candidate && sendPCRef.current)) return;
          await sendPCRef.current.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on("getReceiverAnswer", async(data: { id: string; sdp: RTCSessionDescription }) => {
        try {
          console.log(`get socketID(${data.id})'s answer`);
          const pc: RTCPeerConnection = receivePCsRef.current[data.id];
          if (!pc) return;
          pc.setRemoteDescription(data.sdp);
          console.log(`socketID(${data.id})'s set remote sdp success`);
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on("getReceiverCandidate", async(data: { id: string; candidate: RTCIceCandidateInit }) => {
        try {
          console.log(`get socketID(${data.id})'s candidate`);
          const pc: RTCPeerConnection = receivePCsRef.current[data.id];
          if (!(pc && data.candidate)) return;
          await pc.addIceCandidate(
            new RTCIceCandidate(data.candidate)
          );
          console.log(`socketID(${data.id})'s candidate add success`);
        } catch (error) {
          console.log(error);
        }
      }
    );

    socketRef.current.on("broadcastCursor", async(data: { name: string; x: DoubleRange; y: DoubleRange}) => {
      try {

      } catch (error) {
        console.log(error);
      }
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit("quitRoom", {roomId: "1234"});
        socketRef.current.disconnect();
      }
      if (sendPCRef.current) {
        sendPCRef.current.close();
      }
      users.forEach((user) => closeReceivePC(user.id));
    };
  }, [
    closeReceivePC,
    createReceivePC,
    createSenderOffer,
    getLocalStream,
  ]);

  return (
    <div className="container">
      {users.map((user, index) => (
        <div>
          <div>{user.id}</div>
          <Video key={index} stream={user.stream} />
        </div>
      ))}
    </div>
  );
};

export default App;