export interface RegisterUserDto {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  username?: string;
  phoneNumber?: string;
}

export interface RegisterUserResponse {
  userId: string;
  email: string;
  message: string;
}
