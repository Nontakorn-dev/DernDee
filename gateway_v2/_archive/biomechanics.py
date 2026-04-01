import numpy as np
from scipy.spatial.transform import Rotation as R

class Biomechanics:
    @staticmethod
    def calculate_relative_rotation(q_thigh, q_shank):
        """
        Calculate rotation of Shank relative to Thigh.
        Inputs: quaternions [w, x, y, z]
        Output: Relative Rotation object (Scipy)
        Equation: q_rel = q_thigh_inv * q_shank
        """
        r_thigh = R.from_quat([q_thigh[1], q_thigh[2], q_thigh[3], q_thigh[0]])
        r_shank = R.from_quat([q_shank[1], q_shank[2], q_shank[3], q_shank[0]])
        
        # Relative rotation: from Thigh frame to Shank frame
        r_rel = r_thigh.inv() * r_shank
        return r_rel

    @staticmethod
    def swing_twist_decomposition(q_rel, twist_axis=np.array([0, 0, 1])):
        """
        Decompose a rotation into Swing and Twist components.
        Ref: Dobrowolski, "Swing-Twist Decomposition in Clifford Algebra"
        
        Args:
            q_rel: Relative quaternion [w, x, y, z] (as numpy array or list)
            twist_axis: The axis along the bone (usually Z for IMU mounting)
            
        Returns:
            swing_angle (deg): Flexion/Extension + Abduction
            twist_angle (deg): Internal/External Rotation
        """
        # Convert to Scalar-First [w, x, y, z] for math if input is from R.as_quat (scalar last)
        # Assuming input q_rel is [w, x, y, z] per our convention
        
        w, x, y, z = q_rel
        r_vec = np.array([x, y, z])
        
        # Projection of vector part onto twist axis
        # p = (r . axis) * axis
        projection = np.dot(r_vec, twist_axis) * twist_axis
        
        # Twist Quaternion (qt)
        # qt = [w, projection] normalized
        qt = np.array([w, projection[0], projection[1], projection[2]])
        norm_qt = np.linalg.norm(qt)
        
        if norm_qt < 1e-6:
            # Singularity (180 deg rotation), fallback
            return 0.0, 0.0
            
        qt /= norm_qt # Normalize
        
        # Swap conventions for Scipy [x,y,z,w]
        r_twist = R.from_quat([qt[1], qt[2], qt[3], qt[0]])
        
        # Swing Quaternion (qs) = q_rel * qt_inv
        # q_rel = qs * qt
        r_total = R.from_quat([x, y, z, w])
        r_swing = r_total * r_twist.inv()
        
        # Extract Angles
        # Twist Angle (Rotation around bone axis)
        twist_angle = r_twist.magnitude() * (180.0 / np.pi)
        
        # Swing Angle (Flextion/Extension)
        # This is the magnitude of the remaining rotation
        swing_angle = r_swing.magnitude() * (180.0 / np.pi)
        
        # Sign correction can be complex (dot product with axes)
        # For simple gait, magnitude often suffices for Flexion, 
        # but clinically we need signed (+Flexion, -Extension)
        
        # Simple signed check:
        # If swing axis is roughly X (lateral), then it's flexion
        swing_axis = r_swing.as_rotvec()
        if len(swing_axis) == 3 and np.linalg.norm(swing_axis) > 1e-6:
             # Assume X is flexion axis
             if np.dot(swing_axis, np.array([1, 0, 0])) < 0:
                 swing_angle = -swing_angle
                 
        return swing_angle, twist_angle

    @staticmethod
    def calculate_hip_abduction(q_thigh_w_first):
        """
        Estimate Hip Abduction from Thigh orientation relative to vertical.
        Assuming calibrated "straight" is 0.
        Roll component of Thigh represents Abduction/Adduction.
        """
        r = R.from_quat([q_thigh_w_first[1], q_thigh_w_first[2], q_thigh_w_first[3], q_thigh_w_first[0]])
        # Z-Y-X Euler angles? 
        # Ideally: Projection on frontal plane.
        # Simplification: Global Roll angle
        euler = r.as_euler('xyz', degrees=True)
        return euler[0] # Roll (X-axis)

    @staticmethod
    def calculate_trunk_sway(q_trunk_w_first):
        """
        Estimate Trunk Sway (Roll) from Chest/Trunk orientation.
        """
        r = R.from_quat([q_trunk_w_first[1], q_trunk_w_first[2], q_trunk_w_first[3], q_trunk_w_first[0]])
        euler = r.as_euler('xyz', degrees=True)
        return euler[0] # Roll (X-axis)

    @staticmethod
    def calculate_hip_flexion(q_thigh_w_first):
        """
        Calculate Hip Flexion/Extension from Thigh orientation.
        Pitch (Y-axis) represents Flexion (+) / Extension (-).
        """
        r = R.from_quat([q_thigh_w_first[1], q_thigh_w_first[2], 
                         q_thigh_w_first[3], q_thigh_w_first[0]])
        euler = r.as_euler('xyz', degrees=True)
        return euler[1]  # Pitch (Y-axis)
