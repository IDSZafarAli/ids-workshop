import {Module} from '@nestjs/common';
import {DoctorStorageService} from './doctor-storage.service';

@Module({
  providers: [DoctorStorageService],
  exports: [DoctorStorageService],
})
export class StorageModule {}
