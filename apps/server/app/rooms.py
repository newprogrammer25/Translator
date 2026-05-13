"""Room manager for WebRTC call signaling + translation streaming.

Each room holds exactly two peers. The server relays WebRTC signaling
(offer/answer/ICE) and also handles translation requests so both peers
see live subtitles.
"""

from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket


def generate_room_id() -> str:
    """Short, URL-safe room ID (6 chars)."""
    return secrets.token_urlsafe(4)[:6].lower()


@dataclass
class Peer:
    ws: WebSocket
    language: str = "en-US"
    joined_at: float = field(default_factory=time.time)


@dataclass
class Room:
    room_id: str
    created_at: float = field(default_factory=time.time)
    peers: dict[str, Peer] = field(default_factory=dict)  # peer_id -> Peer

    @property
    def is_full(self) -> bool:
        return len(self.peers) >= 2

    @property
    def peer_count(self) -> int:
        return len(self.peers)

    def other_peer(self, my_id: str) -> Peer | None:
        for pid, peer in self.peers.items():
            if pid != my_id:
                return peer
        return None

    def other_peer_id(self, my_id: str) -> str | None:
        for pid in self.peers:
            if pid != my_id:
                return pid
        return None


class RoomManager:
    """In-memory room registry. For production, use Redis."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def create_room(self) -> Room:
        room_id = generate_room_id()
        while room_id in self._rooms:
            room_id = generate_room_id()
        room = Room(room_id=room_id)
        self._rooms[room_id] = room
        return room

    def get_room(self, room_id: str) -> Room | None:
        return self._rooms.get(room_id)

    def remove_peer(self, room_id: str, peer_id: str) -> None:
        room = self._rooms.get(room_id)
        if room:
            room.peers.pop(peer_id, None)
            if not room.peers:
                # Clean up empty rooms
                del self._rooms[room_id]

    def add_peer(self, room_id: str, peer_id: str, peer: Peer) -> bool:
        room = self._rooms.get(room_id)
        if not room:
            return False
        if room.is_full and peer_id not in room.peers:
            return False
        room.peers[peer_id] = peer
        return True

    def cleanup_stale(self, max_age: float = 3600) -> None:
        """Remove rooms older than max_age seconds."""
        now = time.time()
        stale = [rid for rid, r in self._rooms.items() if now - r.created_at > max_age]
        for rid in stale:
            del self._rooms[rid]


# Global singleton
rooms = RoomManager()
