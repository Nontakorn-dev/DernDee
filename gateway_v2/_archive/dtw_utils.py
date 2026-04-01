import numpy as np

def calculate_dtw_distance(series_a, series_b):
    """
    คำนวณระยะห่าง DTW (Dynamic Time Warping)
    ยิ่งค่าน้อย = ยิ่งเหมือน
    """
    # ป้องกันข้อมูลว่าง
    if not series_a or not series_b:
        return float('inf')

    n, m = len(series_a), len(series_b)
    
    # สร้าง Matrix เก็บค่า cost
    dtw_matrix = np.full((n + 1, m + 1), np.inf)
    dtw_matrix[0, 0] = 0

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = abs(series_a[i - 1] - series_b[j - 1])
            # เลือกทางที่ cost น้อยที่สุด (Match, Insertion, Deletion)
            last_min = np.min([dtw_matrix[i - 1, j],       # Insertion
                               dtw_matrix[i, j - 1],       # Deletion
                               dtw_matrix[i - 1, j - 1]])  # Match
            dtw_matrix[i, j] = cost + last_min

    return dtw_matrix[n, m]

def get_similarity_score(curve_current, curve_template):
    """
    แปลง DTW Distance เป็นคะแนนความเหมือน (0-100%)
    """
    if not curve_template or not curve_current:
        return 0.0
    
    # 1. คำนวณระยะห่างดิบ
    dist = calculate_dtw_distance(curve_current, curve_template)
    
    # 2. แปลงเป็นคะแนน
    # n = จำนวนจุด (ปกติ 100)
    n = len(curve_current)
    
    # avg_error: ความผิดพลาดเฉลี่ยต่อจุด (หน่วยเป็นองศา)
    avg_error = dist / n  
    
    # Threshold: ถ้าผิดพลาดเฉลี่ยเกิน 25 องศาถือว่าไม่เหมือนเลย (0 คะแนน)
    # (เพิ่มจาก 20 เป็น 25 เพื่อให้คะแนนไม่โหดเกินไปสำหรับผู้ป่วย)
    max_allowed_error = 25.0 
    
    # สูตรแปลงเป็น %
    score = max(0, 100 - (avg_error / max_allowed_error * 100))
    
    return round(score, 1)

