class ContextManager:
    def __init__(self):
        # Store latest stance state: { "DernDee_L_Shank": True/False }
        self.states = {}
        # Track which devices are actually connected (for single-sensor mode)
        self.connected_devices = set()
    
    def update_individual_state(self, device_name, is_stance_individual):
        """
        Update the raw state from SHOE Detector.
        """
        self.states[device_name] = is_stance_individual
        self.connected_devices.add(device_name)  # Track connected devices
        
    def get_corrected_stance(self, device_name):
        """
        Apply 'Buddy System' Logic.
        Returns: Final is_stance (bool)
        """
        # Default to individual detection
        is_stance = self.states.get(device_name, True) 
        
        # Parse Side (L/R) and Part (Thigh/Shank)
        # Naming: DernDee_L_Shank, DernDee_R_Thigh
        try:
            _, side, part = device_name.split('_') # e.g. ["DernDee", "L", "Shank"]
        except ValueError:
            return is_stance # Return raw if name doesn't match format
            
        other_side = "R" if side == "L" else "L"
        
        # [FIX] Check if other leg sensors actually exist
        # If only one leg has sensors, disable buddy logic and use SHOE only
        other_thigh_name = f"DernDee_{other_side}_Thigh"
        other_shank_name = f"DernDee_{other_side}_Shank"
        
        has_other_leg = (other_thigh_name in self.connected_devices) or (other_shank_name in self.connected_devices)
        
        # If no other leg sensors, use individual detection only
        if not has_other_leg:
            return is_stance
        
        # Logic: If ANY part of the OTHER leg is SWINGING, this leg MUST be STANCE.
        # This is a simplification for walking. Running might differ.
        
        # Check other leg's parts (only if they exist)
        # Default to None (unknown) instead of True (stance) to avoid false positives
        other_thigh = self.states.get(other_thigh_name, None)
        other_shank = self.states.get(other_shank_name, None)
        
        # [FIX] Only apply buddy logic if we have actual data from other leg
        # If BOTH parts of the OTHER leg are swinging, THIS leg acts as the pivot (Stance).
        if other_thigh is not None and other_shank is not None:
            is_other_leg_swinging_fully = (not other_thigh) and (not other_shank)
            if is_other_leg_swinging_fully:
                return True # Force Stance (Pivot Leg)
        elif other_shank is not None:  # Only shank available
            if not other_shank:  # Other shank is swinging
                return True  # Force this leg to stance
        elif other_thigh is not None:  # Only thigh available
            if not other_thigh:  # Other thigh is swinging
                return True  # Force this leg to stance
            
        return is_stance
