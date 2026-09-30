"""
AsteriaNav-3D Rover Telemetry & Waypoint Pathing Simulator
Simulates autonomous traversal vector generation across the reconstructed 3D planetary mesh.
"""

import math
import random
import time

class RoverTelemetrySim:
    def __init__(self, rover_id="AST-PRAGYAN-X"):
        self.rover_id = rover_id
        self.position = [0.0, 0.0, 5.2] # X, Y, Z in meters
        self.orientation = {"pitch": 2.4, "roll": -1.1, "yaw": 45.0} # degrees
        self.speed = 0.25 # m/s
        self.power_draw_w = 24.5
        self.comm_delay_s = 862.0 # ~14.3 minutes roundtrip light delay to Earth
        
    def calculate_traversal_path(self, hazard_matrix, start_node=(10, 10), goal_node=(70, 70)):
        """
        Generates a simplified gradient-descent safe path that circumvents hazard cells (hazard == 2).
        """
        rows = len(hazard_matrix)
        cols = len(hazard_matrix[0])
        
        current = list(start_node)
        path = [list(current)]
        
        # Greedy step towards goal with hazard repulsion
        for _ in range(120):
            if current[0] == goal_node[0] and current[1] == goal_node[1]:
                break
                
            dx = 1 if goal_node[0] > current[0] else (-1 if goal_node[0] < current[0] else 0)
            dy = 1 if goal_node[1] > current[1] else (-1 if goal_node[1] < current[1] else 0)
            
            # Check candidate moves
            candidates = [
                (current[0] + dx, current[1] + dy),
                (current[0] + dx, current[1]),
                (current[0], current[1] + dy),
                (current[0] + dy, current[1] - dx), # lateral detour
                (current[0] - dy, current[1] + dx)
            ]
            
            moved = False
            for nx, ny in candidates:
                if 0 <= nx < rows and 0 <= ny < cols:
                    if hazard_matrix[nx][ny] < 2: # Safe or caution
                        current = [nx, ny]
                        path.append(list(current))
                        moved = True
                        break
            if not moved:
                break
                
        return path

    def get_realtime_status(self):
        # Add slight natural jitter
        pitch = self.orientation["pitch"] + random.uniform(-0.2, 0.2)
        roll = self.orientation["roll"] + random.uniform(-0.15, 0.15)
        power = self.power_draw_w + random.uniform(-0.4, 0.5)
        
        return {
            "rover_id": self.rover_id,
            "status": "AUTONOMOUS_TRAVERSAL",
            "uplink_state": "OFFLINE_LIGHT_DELAY_14M",
            "attitude": {
                "pitch_deg": round(pitch, 2),
                "roll_deg": round(roll, 2),
                "yaw_deg": self.orientation["yaw"],
                "stability_margin": "OPTIMAL" if abs(pitch) < 15 and abs(roll) < 15 else "HAZARD"
            },
            "metrics": {
                "velocity_mps": self.speed,
                "power_envelope_watts": round(power, 1),
                "odometry_total_m": 148.6,
                "hazard_proximity_m": 12.4
            }
        }

if __name__ == "__main__":
    sim = RoverTelemetrySim()
    print("Rover Telemetry status:", sim.get_realtime_status())