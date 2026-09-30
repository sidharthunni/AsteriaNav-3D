"""
AsteriaNav-3D Core Engine
Reconstruction, Depth Estimation, Metric Point Cloud Generation & Hazard Analysis
Designed for Autonomous Planetary Rovers operating under Deep-Space Communication Lag.
"""

import os
import sys
import json
import math
import numpy as np

class PlanetaryReconstructor:
    def __init__(self, grid_size=100, elevation_scale=35.0):
        self.grid_size = grid_size
        self.elevation_scale = elevation_scale
        
    def generate_synthetic_terrain(self, terrain_type="crater"):
        size = self.grid_size
        x = np.linspace(-1.0, 1.0, size)
        y = np.linspace(-1.0, 1.0, size)
        X, Y = np.meshgrid(x, y)
        R = np.sqrt(X**2 + Y**2)
        
        if terrain_type == "crater":
            rim_radius = 0.45
            rim_height = 0.5 * np.exp(-((R - rim_radius) ** 2) / 0.02)
            depression = -0.8 * np.exp(-(R ** 2) / 0.08)
            noise = 0.06 * np.sin(10 * X) * np.cos(10 * Y) + 0.03 * np.sin(25 * X + 15 * Y)
            Z = rim_height + depression + noise
            
        elif terrain_type == "canyon":
            fault = -1.0 / (1.0 + np.exp(-12.0 * (Y - 0.2 * np.sin(3 * X))))
            ridges = 0.4 * np.sin(5 * X) * np.exp(-((Y) ** 2) / 0.1)
            noise = 0.05 * np.cos(15 * X) * np.sin(18 * Y)
            Z = fault + ridges + noise
            
        elif terrain_type == "boulders":
            base = 0.2 * np.sin(3 * X) * np.cos(3 * Y)
            boulders = np.zeros_like(X)
            boulder_coords = [(-0.3, 0.2, 0.4), (0.2, -0.4, 0.5), (0.4, 0.3, 0.35), 
                              (-0.5, -0.5, 0.3), (0.0, 0.5, 0.45), (0.1, 0.1, 0.25)]
            for bx, by, bh in boulder_coords:
                boulders += bh * np.exp(-(((X - bx) ** 2 + (Y - by) ** 2) / 0.015))
            Z = base + boulders
            
        else: # highlands
            Z = (0.4 * np.sin(4 * X + Y) + 
                 0.3 * np.cos(3 * Y - X) + 
                 0.15 * np.sin(8 * X) * np.cos(8 * Y))
            
        z_min, z_max = np.min(Z), np.max(Z)
        Z_norm = (Z - z_min) / (z_max - z_min + 1e-8)
        elevation_meters = Z_norm * self.elevation_scale
        return X, Y, elevation_meters

    def compute_surface_normals_and_slopes(self, elevation_matrix):
        dz_dy, dz_dx = np.gradient(elevation_matrix)
        dx = 100.0 / self.grid_size
        dy = 100.0 / self.grid_size
        
        nx = -dz_dx / dx
        ny = -dz_dy / dy
        nz = np.ones_like(elevation_matrix)
        
        magnitude = np.sqrt(nx**2 + ny**2 + nz**2)
        nx /= magnitude
        ny /= magnitude
        nz /= magnitude
        
        slope_rad = np.arccos(np.clip(nz, 0.0, 1.0))
        slope_deg = np.degrees(slope_rad)
        return nx, ny, nz, slope_deg

    def evaluate_hazard_zones(self, slope_deg):
        hazard_map = np.zeros_like(slope_deg, dtype=int)
        hazard_map[(slope_deg >= 12.0) & (slope_deg < 25.0)] = 1
        hazard_map[slope_deg >= 25.0] = 2
        return hazard_map

    def find_optimal_landing_zone(self, slope_deg, radius_pixels=6):
        size = self.grid_size
        best_score = float("inf")
        best_center = (size // 2, size // 2)
        
        for i in range(radius_pixels, size - radius_pixels, 2):
            for j in range(radius_pixels, size - radius_pixels, 2):
                window = slope_deg[i - radius_pixels:i + radius_pixels, 
                                   j - radius_pixels:j + radius_pixels]
                score = np.mean(window) * 0.7 + np.max(window) * 0.3
                if score < best_score:
                    best_score = score
                    best_center = (i, j)
        return best_center, best_score

    def export_terrain_payload(self, terrain_type="crater", output_path=None):
        X, Y, Z = self.generate_synthetic_terrain(terrain_type)
        nx, ny, nz, slope_deg = self.compute_surface_normals_and_slopes(Z)
        hazard_map = self.evaluate_hazard_zones(slope_deg)
        landing_center, landing_score = self.find_optimal_landing_zone(slope_deg)
        
        total_points = self.grid_size * self.grid_size
        safe_points = int(np.sum(hazard_map == 0))
        caution_points = int(np.sum(hazard_map == 1))
        hazard_points = int(np.sum(hazard_map == 2))
        
        payload = {
            "metadata": {
                "system": "AsteriaNav-3D Core Reconstructor",
                "version": "1.0-indigenous",
                "terrain_type": terrain_type,
                "grid_resolution": self.grid_size,
                "total_vertices": total_points,
                "elevation_range_m": [float(np.min(Z)), float(np.max(Z))],
                "mean_slope_deg": round(float(np.mean(slope_deg)), 2),
                "max_slope_deg": round(float(np.max(slope_deg)), 2),
                "safe_traversal_percentage": round((safe_points / total_points) * 100.0, 2),
                "hazard_percentage": round((hazard_points / total_points) * 100.0, 2),
                "optimal_landing_site": {
                    "grid_coords": [int(landing_center[0]), int(landing_center[1])],
                    "mean_incline_deg": round(float(landing_score), 2),
                    "status": "TOUCHDOWN_APPROVED" if landing_score < 10.0 else "SUBOPTIMAL"
                }
            },
            "elevation_matrix": Z.round(2).tolist(),
            "slope_matrix": slope_deg.round(1).tolist(),
            "hazard_classification": hazard_map.tolist()
        }
        
        if output_path:
            with open(output_path, "w") as f:
                json.dump(payload, f)
            print(f"Exported: {output_path}")
        return payload

    def export_ply(self, terrain_type="crater", output_path="terrain.ply"):
        X, Y, Z = self.generate_synthetic_terrain(terrain_type)
        _, _, _, slope_deg = self.compute_surface_normals_and_slopes(Z)
        hazard_map = self.evaluate_hazard_zones(slope_deg)
        
        size = self.grid_size
        total_vertices = size * size
        
        with open(output_path, "w") as f:
            f.write("ply\nformat ascii 1.0\nelement vertex " + str(total_vertices) + "\n")
            f.write("property float x\nproperty float y\nproperty float z\n")
            f.write("property uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n")
            for i in range(size):
                for j in range(size):
                    px = X[i, j] * 50.0
                    py = Y[i, j] * 50.0
                    pz = Z[i, j]
                    h = hazard_map[i, j]
                    if h == 0:
                        r, g, b = 30, 230, 140
                    elif h == 1:
                        r, g, b = 240, 190, 40
                    else:
                        r, g, b = 250, 40, 60
                    f.write(f"{px:.2f} {py:.2f} {pz:.2f} {r} {g} {b}\n")
        print(f"Exported PLY: {output_path}")

if __name__ == "__main__":
    reconstructor = PlanetaryReconstructor(grid_size=80)
    out_dir = "/home/sid/AsteriaNav-3D/data"
    os.makedirs(out_dir, exist_ok=True)
    for t in ["crater", "canyon", "boulders", "highlands"]:
        reconstructor.export_terrain_payload(t, f"{out_dir}/{t}_payload.json")
    reconstructor.export_ply("crater", f"{out_dir}/crater_pointcloud.ply")
    print("Reconstruction execution complete.")