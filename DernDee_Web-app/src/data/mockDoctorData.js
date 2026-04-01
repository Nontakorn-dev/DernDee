// Mock data for Doctor Dashboard and Patient Management
// This data simulates real patient and session data for testing

export const mockPatients = [
    {
        id: 'patient-001',
        name: 'John Doe',
        patientId: 'P001',
        email: 'john.doe@example.com',
        phone: '+66 123 456 789',
        age: 45,
        gender: 'Male',
        status: 'active',
        progress: 85,
        totalSessions: 24,
        startDate: '2023-10-01',
        lastSession: '2024-01-15',
        nextReview: '2024-01-20',
        therapistId: 'doctor-001',
        diagnosis: 'Post-stroke rehabilitation',
        goals: ['Improve walking speed', 'Increase step length', 'Reduce double support time']
    },
    {
        id: 'patient-002',
        name: 'Jane Smith',
        patientId: 'P002',
        email: 'jane.smith@example.com',
        phone: '+66 234 567 890',
        age: 52,
        gender: 'Female',
        status: 'review',
        progress: 72,
        totalSessions: 18,
        startDate: '2023-11-15',
        lastSession: '2024-01-14',
        nextReview: '2024-01-18',
        therapistId: 'doctor-001',
        diagnosis: 'Knee replacement recovery',
        goals: ['Restore normal gait pattern', 'Improve balance']
    },
    {
        id: 'patient-003',
        name: 'Mike Johnson',
        patientId: 'P003',
        email: 'mike.johnson@example.com',
        phone: '+66 345 678 901',
        age: 38,
        gender: 'Male',
        status: 'active',
        progress: 90,
        totalSessions: 30,
        startDate: '2023-09-10',
        lastSession: '2024-01-13',
        nextReview: '2024-01-22',
        therapistId: 'doctor-001',
        diagnosis: 'Sports injury recovery',
        goals: ['Return to sports', 'Improve cadence']
    },
    {
        id: 'patient-004',
        name: 'Sarah Williams',
        patientId: 'P004',
        email: 'sarah.williams@example.com',
        phone: '+66 456 789 012',
        age: 61,
        gender: 'Female',
        status: 'review',
        progress: 65,
        totalSessions: 15,
        startDate: '2023-12-01',
        lastSession: '2024-01-12',
        nextReview: '2024-01-16',
        therapistId: 'doctor-001',
        diagnosis: 'Parkinson\'s disease management',
        goals: ['Maintain mobility', 'Prevent falls']
    },
    {
        id: 'patient-005',
        name: 'David Brown',
        patientId: 'P005',
        email: 'david.brown@example.com',
        phone: '+66 567 890 123',
        age: 55,
        gender: 'Male',
        status: 'completed',
        progress: 100,
        totalSessions: 40,
        startDate: '2023-08-01',
        lastSession: '2024-01-11',
        nextReview: null,
        therapistId: 'doctor-001',
        diagnosis: 'Hip replacement recovery',
        goals: ['Full recovery achieved']
    },
    {
        id: 'patient-006',
        name: 'Emily Davis',
        patientId: 'P006',
        email: 'emily.davis@example.com',
        phone: '+66 678 901 234',
        age: 43,
        gender: 'Female',
        status: 'active',
        progress: 78,
        totalSessions: 20,
        startDate: '2023-10-20',
        lastSession: '2024-01-10',
        nextReview: '2024-01-17',
        therapistId: 'doctor-001',
        diagnosis: 'Ankle fracture recovery',
        goals: ['Restore normal walking', 'Improve stability']
    },
    {
        id: 'patient-007',
        name: 'Robert Wilson',
        patientId: 'P007',
        email: 'robert.wilson@example.com',
        phone: '+66 789 012 345',
        age: 49,
        gender: 'Male',
        status: 'active',
        progress: 82,
        totalSessions: 22,
        startDate: '2023-10-05',
        lastSession: '2024-01-09',
        nextReview: '2024-01-19',
        therapistId: 'doctor-001',
        diagnosis: 'Lower back pain rehabilitation',
        goals: ['Improve posture', 'Reduce pain during walking']
    },
    {
        id: 'patient-008',
        name: 'Lisa Anderson',
        patientId: 'P008',
        email: 'lisa.anderson@example.com',
        phone: '+66 890 123 456',
        age: 56,
        gender: 'Female',
        status: 'review',
        progress: 68,
        totalSessions: 16,
        startDate: '2023-11-25',
        lastSession: '2024-01-08',
        nextReview: '2024-01-15',
        therapistId: 'doctor-001',
        diagnosis: 'Multiple sclerosis management',
        goals: ['Maintain independence', 'Improve endurance']
    },
    {
        id: 'patient-009',
        name: 'James Taylor',
        patientId: 'P009',
        email: 'james.taylor@example.com',
        phone: '+66 901 234 567',
        age: 41,
        gender: 'Male',
        status: 'active',
        progress: 88,
        totalSessions: 28,
        startDate: '2023-09-20',
        lastSession: '2024-01-07',
        nextReview: '2024-01-21',
        therapistId: 'doctor-001',
        diagnosis: 'Achilles tendon repair',
        goals: ['Full range of motion', 'Return to running']
    },
    {
        id: 'patient-010',
        name: 'Maria Garcia',
        patientId: 'P010',
        email: 'maria.garcia@example.com',
        phone: '+66 012 345 678',
        age: 58,
        gender: 'Female',
        status: 'active',
        progress: 75,
        totalSessions: 19,
        startDate: '2023-11-10',
        lastSession: '2024-01-06',
        nextReview: '2024-01-18',
        therapistId: 'doctor-001',
        diagnosis: 'Osteoarthritis management',
        goals: ['Reduce joint stress', 'Improve mobility']
    },
    {
        id: 'patient-011',
        name: 'William Martinez',
        patientId: 'P011',
        email: 'william.martinez@example.com',
        phone: '+66 123 456 789',
        age: 47,
        gender: 'Male',
        status: 'review',
        progress: 70,
        totalSessions: 17,
        startDate: '2023-11-30',
        lastSession: '2024-01-05',
        nextReview: '2024-01-14',
        therapistId: 'doctor-001',
        diagnosis: 'Spinal cord injury rehabilitation',
        goals: ['Improve walking ability', 'Increase strength']
    },
    {
        id: 'patient-012',
        name: 'Patricia Lee',
        patientId: 'P012',
        email: 'patricia.lee@example.com',
        phone: '+66 234 567 890',
        age: 54,
        gender: 'Female',
        status: 'active',
        progress: 80,
        totalSessions: 21,
        startDate: '2023-10-15',
        lastSession: '2024-01-04',
        nextReview: '2024-01-20',
        therapistId: 'doctor-001',
        diagnosis: 'Cerebral palsy management',
        goals: ['Improve gait efficiency', 'Reduce energy expenditure']
    }
];

// Mock sessions for each patient
export const mockSessions = {
    'patient-001': [
        {
            id: 'session-001-001',
            date: '2024-01-15',
            time: '10:30',
            cadence: 110,
            stepLength: 0.75,
            strideLength: 1.5,
            walkingSpeed: 1.2,
            doubleSupportTime: 25,
            singleSupportTime: 40,
            duration: '05:00',
            totalSteps: 280,
            status: 'reviewed',
            reviewNotes: 'Good progress. Cadence improved from last session. Continue current therapy plan.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-15T11:00:00'
        },
        {
            id: 'session-001-002',
            date: '2024-01-14',
            time: '14:20',
            cadence: 108,
            stepLength: 0.73,
            strideLength: 1.48,
            walkingSpeed: 1.18,
            doubleSupportTime: 26,
            singleSupportTime: 39,
            duration: '05:30',
            totalSteps: 290,
            status: 'reviewed',
            reviewNotes: 'Stable performance. Monitor step length improvement.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-14T15:00:00'
        },
        {
            id: 'session-001-003',
            date: '2024-01-13',
            time: '09:15',
            cadence: 105,
            stepLength: 0.72,
            strideLength: 1.45,
            walkingSpeed: 1.15,
            doubleSupportTime: 27,
            singleSupportTime: 38,
            duration: '05:15',
            totalSteps: 275,
            status: 'reviewed',
            reviewNotes: 'Slight decrease in cadence. Review exercise intensity.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-13T10:00:00'
        },
        {
            id: 'session-001-004',
            date: '2024-01-12',
            time: '16:45',
            cadence: 112,
            stepLength: 0.77,
            strideLength: 1.52,
            walkingSpeed: 1.25,
            doubleSupportTime: 24,
            singleSupportTime: 41,
            duration: '06:00',
            totalSteps: 300,
            status: 'reviewed',
            reviewNotes: 'Excellent session! Best performance so far. Patient showing great improvement.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-12T17:30:00'
        }
    ],
    'patient-002': [
        {
            id: 'session-002-001',
            date: '2024-01-14',
            time: '11:00',
            cadence: 95,
            stepLength: 0.65,
            strideLength: 1.30,
            walkingSpeed: 1.05,
            doubleSupportTime: 30,
            singleSupportTime: 35,
            duration: '04:30',
            totalSteps: 240,
            status: 'pending',
            reviewNotes: '',
            reviewedBy: null,
            reviewedAt: null
        },
        {
            id: 'session-002-002',
            date: '2024-01-13',
            time: '15:30',
            cadence: 93,
            stepLength: 0.63,
            strideLength: 1.28,
            walkingSpeed: 1.02,
            doubleSupportTime: 32,
            singleSupportTime: 34,
            duration: '04:45',
            totalSteps: 250,
            status: 'reviewed',
            reviewNotes: 'Progressing well. Continue with balance exercises.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-13T16:00:00'
        }
    ],
    'patient-003': [
        {
            id: 'session-003-001',
            date: '2024-01-13',
            time: '08:00',
            cadence: 125,
            stepLength: 0.85,
            strideLength: 1.70,
            walkingSpeed: 1.45,
            doubleSupportTime: 20,
            singleSupportTime: 45,
            duration: '06:30',
            totalSteps: 380,
            status: 'reviewed',
            reviewNotes: 'Outstanding performance. Patient ready for advanced exercises.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-13T09:00:00'
        },
        {
            id: 'session-003-002',
            date: '2024-01-12',
            time: '10:00',
            cadence: 122,
            stepLength: 0.83,
            strideLength: 1.68,
            walkingSpeed: 1.42,
            doubleSupportTime: 21,
            singleSupportTime: 44,
            duration: '06:15',
            totalSteps: 370,
            status: 'reviewed',
            reviewNotes: 'Consistent improvement. Maintain current training intensity.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-12T11:00:00'
        }
    ],
    'patient-004': [
        {
            id: 'session-004-001',
            date: '2024-01-12',
            time: '13:00',
            cadence: 88,
            stepLength: 0.58,
            strideLength: 1.16,
            walkingSpeed: 0.95,
            doubleSupportTime: 35,
            singleSupportTime: 30,
            duration: '04:00',
            totalSteps: 200,
            status: 'pending',
            reviewNotes: '',
            reviewedBy: null,
            reviewedAt: null
        }
    ],
    'patient-005': [
        {
            id: 'session-005-001',
            date: '2024-01-11',
            time: '09:30',
            cadence: 115,
            stepLength: 0.80,
            strideLength: 1.60,
            walkingSpeed: 1.35,
            doubleSupportTime: 22,
            singleSupportTime: 42,
            duration: '07:00',
            totalSteps: 400,
            status: 'reviewed',
            reviewNotes: 'Treatment completed successfully. Patient achieved all goals.',
            reviewedBy: 'doctor-001',
            reviewedAt: '2024-01-11T10:30:00'
        }
    ]
};

// Mock dashboard statistics
export const mockDashboardStats = {
    totalPatients: 12,
    activeSessions: 8,
    pendingReviews: 5,
    completedToday: 15,
    averageProgress: 78,
    totalSessionsThisMonth: 145
};

// Mock recent patients for dashboard
export const mockRecentPatients = [
    {
        id: 'patient-001',
        name: 'John Doe',
        patientId: 'P001',
        lastSession: '2024-01-15',
        status: 'active',
        progress: 85
    },
    {
        id: 'patient-002',
        name: 'Jane Smith',
        patientId: 'P002',
        lastSession: '2024-01-14',
        status: 'review',
        progress: 72
    },
    {
        id: 'patient-003',
        name: 'Mike Johnson',
        patientId: 'P003',
        lastSession: '2024-01-13',
        status: 'active',
        progress: 90
    },
    {
        id: 'patient-004',
        name: 'Sarah Williams',
        patientId: 'P004',
        lastSession: '2024-01-12',
        status: 'review',
        progress: 65
    },
    {
        id: 'patient-005',
        name: 'David Brown',
        patientId: 'P005',
        lastSession: '2024-01-11',
        status: 'completed',
        progress: 100
    }
];

// Helper function to get patient by ID
export const getPatientById = (patientId) => {
    return mockPatients.find(p => p.id === patientId || p.patientId === patientId);
};

// Helper function to get sessions by patient ID
export const getSessionsByPatientId = (patientId) => {
    const patient = getPatientById(patientId);
    if (!patient) return [];
    return mockSessions[patient.id] || [];
};

// Helper function to get session by ID
export const getSessionById = (patientId, sessionId) => {
    const sessions = getSessionsByPatientId(patientId);
    return sessions.find(s => s.id === sessionId);
};

// Helper function to get patients by status
export const getPatientsByStatus = (status) => {
    if (status === 'all') return mockPatients;
    return mockPatients.filter(p => p.status === status);
};

// Helper function to get pending reviews count
export const getPendingReviewsCount = () => {
    let count = 0;
    Object.values(mockSessions).forEach(sessions => {
        sessions.forEach(session => {
            if (session.status === 'pending') count++;
        });
    });
    return count;
};

