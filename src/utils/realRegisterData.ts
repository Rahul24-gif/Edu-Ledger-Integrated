import { PaymentRecord, RegisterStatusCategory, StudentRecord } from '../types';

export interface RawRegisterRow {
  srNo: number;
  name: string;
  batch: 'Batch 2025-26' | 'Batch 2026-27';
  xiDate: string;
  xiPaid: number;
  xiiDate: string;
  xiiPaid: number;
  remark: RegisterStatusCategory;
}

/**
 * Exact 143 Student Rows from the user's "Integrated Fees Register" (Consolidated Sheet rows 18–160).
 * Preserves exact Sr. No., Student Name, Batch, Class XI Payment Date & Amount, Class XII Payment Date & Amount, and Remark.
 */
export const RAW_REGISTER_ROWS: RawRegisterRow[] = [
  // ================= BATCH 2025-26 (60 Students: Sr. No. 1 to 60) =================
  { srNo: 1, name: 'Shurya Kumar Sivaraman', batch: 'Batch 2025-26', xiDate: '24/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 2, name: 'Barira  Chainwala', batch: 'Batch 2025-26', xiDate: '26/05/2025', xiPaid: 10000, xiiDate: '23/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 3, name: 'Divya mukesh patil', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 4, name: 'Tejal Gopal', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 5, name: 'Kartike pankajkumar gupta', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 6, name: 'VAIBHAV KUMAR', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 7, name: 'Akshara Ranjeet Shah', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 8, name: 'Parth Pankaj Rane', batch: 'Batch 2025-26', xiDate: '02/07/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 9, name: 'Aditi  Sharma', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 10, name: 'Siya Sachin MHATRE', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 11, name: 'Ravi Narayanan Narayanan', batch: 'Batch 2025-26', xiDate: '28/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 12, name: 'Kherati Sunder', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 13, name: 'Vedant Padmakar Bhoir', batch: 'Batch 2025-26', xiDate: '28/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 14, name: 'NlMISH KUNJAN KANDALKAR', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '06/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 15, name: 'Anandi Sunil Thate', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '06/06/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 16, name: 'SIDDHI CHAUDHARI', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 17, name: 'Shruta Viraj Ranade', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 18, name: 'Shrinika Ramesh kumar shetty', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 19, name: 'Sanskruti Atul Naphade', batch: 'Batch 2025-26', xiDate: '02/07/2025', xiPaid: 10000, xiiDate: '13/06/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 20, name: 'maahibhanushalibhanushali', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 21, name: 'AARADHYA GHAGGHAG GHAG', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '08/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 22, name: 'Geetika Vijaykumar Ghumed', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 23, name: 'Vedika Santosh Gore', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 24, name: 'SHREYA DASH', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '22/08/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 25, name: 'Diksha Bharti', batch: 'Batch 2025-26', xiDate: '30/05/2025', xiPaid: 10000, xiiDate: '18/06/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 26, name: 'Ishika Raju Arakh', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 27, name: 'Neeharika Naresha Prabhu', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '08/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 28, name: 'Gargi Pankaj Patil Patil', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 29, name: 'Shurami Jadhav', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 30, name: 'Jui Pramod Mali', batch: 'Batch 2025-26', xiDate: '11/06/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 31, name: 'ARUNDEEPIKA MURMU', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 32, name: 'Anushka Sandeep Singh', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 33, name: 'Shreetej Vikas Shinde', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 34, name: 'Ayush sameer Rajeshirke', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 35, name: 'Ishita Roy', batch: 'Batch 2025-26', xiDate: '29/05/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 36, name: 'Shivam Hariprasad Dev', batch: 'Batch 2025-26', xiDate: '23/07/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 37, name: 'NaVya Vijay Singh', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 38, name: 'Ketaki vishal khairnar', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 39, name: 'Samudyatha Hemappa Belagal', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 40, name: 'Sumita Sushil Sharma', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 41, name: 'Mugdha Nayan Ballal', batch: 'Batch 2025-26', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 42, name: 'Urmika Jayakumar -', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '03/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 43, name: 'Aryan Amol Zagade', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '10/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 44, name: 'Pawan Sanjay Tiwari', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '17/06/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 45, name: 'Vaibhav brijesh shukla', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '04/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 46, name: 'Atharv Kesarwani', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Will Pay June 26' },
  { srNo: 47, name: 'Preeti Balram Yadav', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 48, name: 'Rajdeep sinh k Jadeja', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '11/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 49, name: 'Arya Vikas Ajgaonkar', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 50, name: 'Isha Ugrasen Yadav', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 51, name: 'Isha Atul Chaudhari', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '11/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 52, name: 'Ankan Abhijit Khanra', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 53, name: 'Aayushi Sadanand Epili', batch: 'Batch 2025-26', xiDate: 'May 2025', xiPaid: 5000, xiiDate: '-', xiiPaid: 0, remark: 'Partial Paid (₹5k Due)' },
  { srNo: 54, name: 'Chinmay Dhenge', batch: 'Batch 2025-26', xiDate: '05/07/2025', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Admission Cancelled' },
  { srNo: 55, name: 'Dhanashree Shingne', batch: 'Batch 2025-26', xiDate: '05/08/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 56, name: 'Shravani Sunil Kale', batch: 'Batch 2025-26', xiDate: '27/05/2025', xiPaid: 10000, xiiDate: '09/04/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 57, name: 'Kshiti Dwarkadhish Gupta', batch: 'Batch 2025-26', xiDate: '08/07/2025', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'XII Pending' },
  { srNo: 58, name: 'AASHI GUPTA', batch: 'Batch 2025-26', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 59, name: 'Vihan Abhishek Varma', batch: 'Batch 2025-26', xiDate: '-', xiPaid: 0, xiiDate: '23/03/2026', xiiPaid: 10000, remark: 'Direct XII Paid' },
  { srNo: 60, name: 'Bijesh Prathapani', batch: 'Batch 2025-26', xiDate: '-', xiPaid: 0, xiiDate: '14/04/2026', xiiPaid: 10000, remark: 'Direct XII Paid' },

  // ================= BATCH 2026-27 (83 Students: Sr. No. 61 to 143) =================
  { srNo: 61, name: 'Aryan Rohit Bavadia', batch: 'Batch 2026-27', xiDate: '21/03/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 62, name: 'Shaurya Barun Singh', batch: 'Batch 2026-27', xiDate: '25/05/2026', xiPaid: 10000, xiiDate: '25/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 63, name: 'Pranjal Ritesh Kamerkar', batch: 'Batch 2026-27', xiDate: '06/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 64, name: 'Shaurya Manoj Mimani', batch: 'Batch 2026-27', xiDate: '29/04/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 65, name: 'TANVI ULHAS PATIL', batch: 'Batch 2026-27', xiDate: '29/04/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 66, name: 'Shubham Sujay Rana', batch: 'Batch 2026-27', xiDate: '07/05/2026', xiPaid: 10000, xiiDate: '07/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 67, name: 'Chandrima CHANDAN Rana', batch: 'Batch 2026-27', xiDate: '07/05/2026', xiPaid: 10000, xiiDate: '07/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 68, name: 'Sarthak Raju Gaikwad', batch: 'Batch 2026-27', xiDate: '12/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 69, name: 'Durvank Ravindra Bhagat', batch: 'Batch 2026-27', xiDate: '07/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 70, name: 'Salman NAYER Shaikh', batch: 'Batch 2026-27', xiDate: '07/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 71, name: 'Ayush Anant Bhushan Pandey', batch: 'Batch 2026-27', xiDate: '08/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 72, name: 'Tanishka Sushant Patil', batch: 'Batch 2026-27', xiDate: '08/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 73, name: 'Shravani Paresh Patil', batch: 'Batch 2026-27', xiDate: '08/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 74, name: 'Rudrakshi Vijay Chavan', batch: 'Batch 2026-27', xiDate: '09/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 75, name: 'Siddhant Gawade', batch: 'Batch 2026-27', xiDate: '09/05/2026', xiPaid: 10000, xiiDate: '07/07/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 76, name: 'Manav Gorakhnath Mhatre', batch: 'Batch 2026-27', xiDate: '12/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 77, name: 'Aditi Adhikary', batch: 'Batch 2026-27', xiDate: '22/08/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 78, name: 'Chiranjivi SINGH', batch: 'Batch 2026-27', xiDate: '12/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 79, name: 'Tanvi Naval Patil', batch: 'Batch 2026-27', xiDate: '15/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 80, name: 'Krish Vindeshwar Shah', batch: 'Batch 2026-27', xiDate: '15/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 81, name: 'KARUNYA SADAN KADAM', batch: 'Batch 2026-27', xiDate: '16/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 82, name: 'Meet Arihant Chordiya', batch: 'Batch 2026-27', xiDate: '18/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 83, name: 'Hansika Santoah Rajput', batch: 'Batch 2026-27', xiDate: '20/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 84, name: 'Tanishka Tushar Mukkirwar', batch: 'Batch 2026-27', xiDate: '20/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 85, name: 'Rishikesh Jay Pandey', batch: 'Batch 2026-27', xiDate: '21/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 86, name: 'Anushree Surve', batch: 'Batch 2026-27', xiDate: '23/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 87, name: 'Armaan Muhimtule', batch: 'Batch 2026-27', xiDate: '26/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 88, name: 'Komal Nandlal Varma', batch: 'Batch 2026-27', xiDate: '26/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 89, name: 'Prajoyat Pradip Bhunia', batch: 'Batch 2026-27', xiDate: '26/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 90, name: 'Anushka Soumitro Das', batch: 'Batch 2026-27', xiDate: '29/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 91, name: 'Tanish Ganesh Shinde', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 92, name: 'Tanvi Satish Tiwari', batch: 'Batch 2026-27', xiDate: '30/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 93, name: 'Ekta Sahani', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 94, name: 'Piyush Mahendra Neharkar', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 95, name: 'Jayaditya Vijay Shendre', batch: 'Batch 2026-27', xiDate: '02/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 96, name: 'Swarit Prasahnt Dhenge', batch: 'Batch 2026-27', xiDate: '02/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 97, name: 'Praful Sawan Rathod', batch: 'Batch 2026-27', xiDate: '06/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 98, name: 'Rahul Vinod Mendon', batch: 'Batch 2026-27', xiDate: '06/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 99, name: 'Hansika Girish Joshi', batch: 'Batch 2026-27', xiDate: '11/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 100, name: 'Vedant Chandrashekhar Keny', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 101, name: 'Vaishnavi Dharmendra Chandra', batch: 'Batch 2026-27', xiDate: '11/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 102, name: 'Avi Ajeet Mishra', batch: 'Batch 2026-27', xiDate: '16/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 103, name: 'Neel Rohit Pipalia', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 104, name: 'Ayush Kumar Sinha', batch: 'Batch 2026-27', xiDate: '22/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 105, name: 'Vidhi Sandeep Gole', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 106, name: 'Sohan Kaiwalya Mate', batch: 'Batch 2026-27', xiDate: '14/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 107, name: 'Amritanshu Ramanand Tiwari', batch: 'Batch 2026-27', xiDate: '17/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 108, name: 'Sarvam Devanand Pandey', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 109, name: 'Maahi Hiren Hindlekar', batch: 'Batch 2026-27', xiDate: '06/05/2026', xiPaid: 10000, xiiDate: '07/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 110, name: 'Manasvi mahesh sawant', batch: 'Batch 2026-27', xiDate: '07/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 111, name: 'Harshika Kishor Marathe', batch: 'Batch 2026-27', xiDate: '08/05/2026', xiPaid: 10000, xiiDate: '08/05/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 112, name: 'Kinjal Sunil Shinde', batch: 'Batch 2026-27', xiDate: '16/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 113, name: 'Sakshi Herode', batch: 'Batch 2026-27', xiDate: '19/05/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 114, name: 'Shruti Gopal Telang', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 115, name: 'Devansh Kamlesh Verma', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 116, name: 'Srujan Sarangdhar Shinde', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 117, name: 'Shravani Kiran Sontate', batch: 'Batch 2026-27', xiDate: '01/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 118, name: 'Anukalp Dhananjay Singh', batch: 'Batch 2026-27', xiDate: '02/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 119, name: 'Deep Pankaj Kokate', batch: 'Batch 2026-27', xiDate: '06/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 120, name: 'Vaishnavi Rajesh Chaurasia', batch: 'Batch 2026-27', xiDate: '11/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 121, name: 'Maniraj Amit Jadhav', batch: 'Batch 2026-27', xiDate: '11/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 122, name: 'Priya Dharmendra Rajbhar', batch: 'Batch 2026-27', xiDate: '17/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 123, name: 'Anshika Ramanand Tiwari', batch: 'Batch 2026-27', xiDate: '17/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 124, name: 'Avni Arvind Choudhary', batch: 'Batch 2026-27', xiDate: '06/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 125, name: 'Aarya Jayesh Thakur', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 126, name: 'Rudra Rajan Prasad', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 127, name: 'Prachiti Yogesh Kamble', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 128, name: 'Harshal Dharmendra Patil', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 129, name: 'Tanmay Nilesh Bhoir', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 130, name: 'Vedica Pankaj Keer', batch: 'Batch 2026-27', xiDate: '02/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 131, name: 'Adhrit Kaushik Guha', batch: 'Batch 2026-27', xiDate: '03/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 132, name: 'Supriya HITESH Chauhan', batch: 'Batch 2026-27', xiDate: '05/06/2026', xiPaid: 10000, xiiDate: '05/06/2026', xiiPaid: 10000, remark: 'Full Paid' },
  { srNo: 133, name: 'HITESH DHANORKAR', batch: 'Batch 2026-27', xiDate: '06/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 134, name: 'Uttam Ashok Sisodiya', batch: 'Batch 2026-27', xiDate: '08/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 135, name: 'Padmaja Chintan Kouloorkar', batch: 'Batch 2026-27', xiDate: '11/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 136, name: 'ShantanuPatilPatil', batch: 'Batch 2026-27', xiDate: '13/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 137, name: 'Niti Joshi', batch: 'Batch 2026-27', xiDate: '13/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 138, name: 'Granthik Bhadale', batch: 'Batch 2026-27', xiDate: '16/06/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 139, name: 'Ansh Rajesh Sayla', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
  { srNo: 140, name: 'Ichha Ashish Shrimali', batch: 'Batch 2026-27', xiDate: '07/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 141, name: 'Shravani Sunil Shinde', batch: 'Batch 2026-27', xiDate: '10/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 142, name: 'Pranav Rajaram Warang', batch: 'Batch 2026-27', xiDate: '16/07/2026', xiPaid: 10000, xiiDate: '-', xiiPaid: 0, remark: 'Only XI Paid' },
  { srNo: 143, name: 'Zayeem Kabeer Ahamed', batch: 'Batch 2026-27', xiDate: '-', xiPaid: 0, xiiDate: '-', xiiPaid: 0, remark: 'Fee Pending' },
];

/**
 * Extracts Father's name from Indian 3-part student names (e.g., "Divya mukesh patil" -> "Mukesh Patil", "Anshuman Atul Singh" -> "Atul Singh").
 */
function deriveFatherName(fullName: string): string {
  const cleaned = fullName.replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length >= 3) {
    return parts.slice(1).join(' ');
  }
  if (parts.length === 2) {
    return parts[1];
  }
  return cleaned;
}

/**
 * Converts the 143 real register rows into StudentRecord[] and PaymentRecord[]
 */
export function buildRealRegisterRecords(ownerId: string): {
  students: StudentRecord[];
  payments: PaymentRecord[];
} {
  const students: StudentRecord[] = [];
  const payments: PaymentRecord[] = [];

  RAW_REGISTER_ROWS.forEach((row) => {
    const isBatch25 = row.batch === 'Batch 2025-26';
    const enrollmentAY = isBatch25 ? '2025-26' : '2026-27';
    const progressionAY = isBatch25 ? '2026-27' : '2027-28';

    const isDirectXII = row.remark === 'Direct XII Paid';
    const isCancelled = row.remark === 'Admission Cancelled';

    const classXIFee = isDirectXII || isCancelled ? 0 : 10000;
    const classXIIFee = isCancelled ? 0 : 10000;
    const totalIntegratedFee = classXIFee + classXIIFee;
    const totalPaid = row.xiPaid + row.xiiPaid;

    const studentId = `stu_reg_${String(row.srNo).padStart(3, '0')}`;
    const rollNo = `00013${String(row.srNo).padStart(3, '0')}`;

    students.push({
      studentId,
      ownerId,
      rollNo,
      fullName: row.name,
      fatherName: deriveFatherName(row.name),
      phone: `98201${String(10000 + row.srNo).slice(-5)}`,
      stream: 'Science (Integrated)',
      centerName: row.batch,
      enrollmentAY,
      progressionAY,
      admissionClass: isDirectXII ? 'XII' : 'XI',
      classXIFee,
      classXIIFee,
      scholarshipDiscount: 0,
      totalIntegratedFee,
      paidClassXI: row.xiPaid,
      paidClassXII: row.xiiPaid,
      totalPaid,
      xiPaymentDate: row.xiDate,
      xiiPaymentDate: row.xiiDate,
      status: isCancelled ? 'dropped' : 'active',
      remarks: row.remark,
    });

    if (row.xiPaid > 0) {
      payments.push({
        paymentId: `pay_xi_${String(row.srNo).padStart(3, '0')}`,
        studentId,
        ownerId,
        studentName: row.name,
        rollNo,
        stream: 'Science (Integrated)',
        enrollmentAY,
        progressionAY,
        recordedInAY: enrollmentAY,
        targetClass: 'XI',
        amount: row.xiPaid,
        allocatedToXI: row.xiPaid,
        allocatedToXII: 0,
        paymentDate: row.xiDate !== '-' ? row.xiDate : `30/05/${enrollmentAY.slice(0, 4)}`,
        paymentMode: 'UPI',
        referenceNo: `IMPS-${row.srNo}`,
        receiptNo: `SFP00027${String(row.srNo).padStart(3, '0')}`,
        installmentLabel: `Fees In Term - I (Class XI)`,
        notes: row.xiPaid < 10000 ? 'Lesser Paid Receipt (₹5,000 Due)' : `Full Paid Class XI (${row.batch})`,
      });
    }

    if (row.xiiPaid > 0) {
      payments.push({
        paymentId: `pay_xii_${String(row.srNo).padStart(3, '0')}`,
        studentId,
        ownerId,
        studentName: row.name,
        rollNo,
        stream: 'Science (Integrated)',
        enrollmentAY,
        progressionAY,
        recordedInAY: progressionAY,
        targetClass: 'XII',
        amount: row.xiiPaid,
        allocatedToXI: 0,
        allocatedToXII: row.xiiPaid,
        paymentDate: row.xiiDate !== '-' ? row.xiiDate : `04/04/${progressionAY.slice(0, 4)}`,
        paymentMode: 'UPI',
        referenceNo: `ONLINE-${row.srNo}`,
        receiptNo: `RCPWNL119${String(row.srNo).padStart(3, '0')}`,
        installmentLabel: isDirectXII
          ? `Fees In Term - II (Direct Class XII)`
          : `Fees In Term - II (Class XII)`,
        notes: `Full Paid Class XII (${row.batch})`,
      });
    }
  });

  return { students, payments };
}
