# RISGW

### This app is for listening mpps message gateway on RIS

> RIS system community with dicom server and storage 

> If request patient review, this app will be patient's infomation to dicom device via mpps

> Then complete scan dicom image or another review, dicom device will be mpps message to this app.

> This app will process mpps message then notify this result of patient's progress status and another information to RIS platform




### Requirement and installation
 - install nodejs
 - mysql server
 - runnig mpps service with dcm4che toolkit 



### Additional feature
- At this app, checking deplicating user on RIS platform using database session.
> Be carefull .env config 

